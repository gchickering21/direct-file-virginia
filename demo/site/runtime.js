/* Runs Direct File's published interview (flow.json) against Direct File's own Fact Graph engine.
   Condition semantics follow df-client-app/src/flow/Condition.ts in the IRS repository. */
(function (root) {
  "use strict";
  const sfg = root.DFFactGraph;

  function buildDictionary(wrapped) {
    const meta = new sfg.DigestMetaWrapper("2024").toNative();
    const facts = wrapped.map((f) => sfg.DigestNodeWrapperFactory.toNative(new sfg.DigestNodeWrapper(f.path, f.writable, f.derived, f.placeholder)));
    return sfg.FactDictionaryFactory.fromConfig(sfg.FactDictionaryConfig.create(meta, facts));
  }
  function newGraph(dict, persisted) {
    return sfg.GraphFactory.apply(dict, sfg.JSPersister.create(JSON.stringify(persisted || {})));
  }

  // Same as the client's Path.concretePath: only the first * takes the collection item.
  const concrete = (path, id) => (path.includes("*") && id ? path.replace("*", "#" + id) : path);
  function get(g, path, id) {
    if (path.includes("*") && !id) return { complete: false, hasValue: false, value: undefined };
    try {
      const r = g.get(concrete(path, id));
      return { complete: !!r.complete, hasValue: !!r.hasValue, value: r.hasValue ? r.get : undefined };
    } catch (e) {
      return { complete: false, hasValue: false, value: undefined };
    }
  }

  // Scala.js keeps field names like "Lgov_irs_factgraph_types_Enum__f_value"; match on the suffix.
  function field(obj, suffix) {
    for (const k of Object.keys(obj)) if (k.endsWith(suffix)) return obj[k];
    return undefined;
  }
  function enumParts(v) {
    if (!v || typeof v !== "object") return null;
    const optionsPath = field(v, "__f_enumOptionsPath");
    return optionsPath === undefined ? null : { value: String(v), optionsPath: String(optionsPath) };
  }
  function itemId(v) {
    const m = /CollectionItem\(([0-9a-fA-F-]+)\)/.exec(String(v));
    return m ? m[1] : null;
  }
  function collectionIds(g, path, id) {
    const r = get(g, path, id);
    if (!r.hasValue) return [];
    try { return Array.from(sfg.convertCollectionToArray(r.value)); } catch (e) { return []; }
  }
  // The choices the rules offer right now: options facts are often derived, e.g. only the filing statuses this household can use.
  function enumChoices(g, optionsPath, id) {
    const r = get(g, optionsPath, id);
    if (!r.hasValue) return null;
    const m = /^List\((.*)\)$/.exec(String(r.value));
    return m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : null;
  }

  function cond(g, raw, id) {
    if (raw === undefined || raw === null) return true;
    const c = typeof raw === "string" ? raw : raw.condition;
    const op = (typeof raw === "object" && raw.operator) || "isTrue";
    // Conditions the static page cannot know: no feature flags, no imported IRS data, the standard signing path.
    if (c === "experimental") return false;
    if (c === "isEssarSigningPath") return op.startsWith("isFalse");
    if (c === "submissionBlockingFactsAreFalse") return op.startsWith("isTrue");
    if (c === "data-import") return op === "isUnknown" || op === "isFalse";
    if (c.includes("*") && !id) return false;
    const f = get(g, c, id);
    const v = !!f.value;
    switch (op) {
      case "isTrue": return f.hasValue && v;
      case "isTrueAndComplete": return f.complete && v;
      case "isTrueOrIncomplete": return !f.complete || v;
      case "isFalse": return f.hasValue && !v;
      case "isFalseAndComplete": return f.complete && !v;
      case "isFalseOrIncomplete": return !f.complete || !v;
      case "isComplete": return f.complete;
      case "isIncomplete": return !f.complete;
      default: return false;
    }
  }
  const all = (g, cs, id) => (cs || []).every((c) => cond(g, c, id));

  // The ordered screens this return would see. A visible knockout screen ends the interview, as in Direct File.
  function walk(g, flow) {
    const out = [];
    let stopped = false;
    const visit = (n, ctx) => {
      if (stopped) return;
      if (n.t === "Screen") {
        if (all(g, n.c, ctx.id)) {
          out.push({ screen: n, id: ctx.id, cat: ctx.cat, sub: ctx.sub, item: ctx.item });
          if (n.ko) stopped = true;
        }
        return;
      }
      let next = ctx;
      if (n.t === "Category") next = Object.assign({}, ctx, { cat: n.route });
      if (n.t === "Subcategory") {
        if (n.any && !n.any.some((c) => cond(g, c, ctx.id))) return;
        next = Object.assign({}, ctx, { sub: n.route });
      }
      if ((n.t === "Subcategory" || n.t === "SubSubcategory") && n.ctx) {
        const r = get(g, n.ctx, ctx.id);
        const id = r.hasValue ? itemId(r.value) : null;
        if (id) next = Object.assign({}, next, { id });
      }
      if (n.t === "Gate" && !all(g, n.c, ctx.id)) return;
      if (n.t === "CollectionLoop") {
        const ids = collectionIds(g, n.coll, ctx.id);
        ids.forEach((id, i) => n.kids.forEach((k) => visit(k, Object.assign({}, next, { id, item: { coll: n.coll, index: i, count: ids.length } }))));
        return;
      }
      (n.kids || []).forEach((k) => visit(k, next));
    };
    visit(flow, { id: null, cat: null, sub: null, item: null });
    return out;
  }

  // Writes an answer the way the client's fact components do, then saves so derived facts recompute.
  function setValue(g, path, id, type, raw, optionsPath) {
    let value;
    if (type === "Boolean") value = !!raw;
    else if (type === "Dollar") { const e = sfg.DollarFactory(String(raw)); if (!e.isRight) return { ok: false }; value = e.right; }
    else if (type === "Enum") { const e = sfg.EnumFactory(String(raw), optionsPath); if (!e.isRight) return { ok: false }; value = e.right; }
    else return { ok: false };
    g.set(concrete(path, id), value);
    const saved = g.save();
    const limits = Array.from((saved && saved.limitViolations) || []).map((v) => ({ level: String(v.level), limit: String(v.limit), actual: String(v.actual), name: String(v.limitName) }));
    return { ok: true, limits };
  }

  root.DFRuntime = { buildDictionary, newGraph, get, cond, all, walk, setValue, enumParts, enumChoices, itemId, collectionIds, concrete };
})(globalThis);

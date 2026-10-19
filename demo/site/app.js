/* The page: the interview on the left, the return, the rules and the proposals on the right.
   Everything it computes comes from runtime.js and Direct File's engine; this file only draws. */
(function () {
  "use strict";
  const R = window.DFRuntime;

  const ITEM = { "/familyAndHousehold": "Person", "/formW2s": "W-2", "/interestReports": "1099-INT", "/form1099Gs": "1099-G", "/form1099Rs": "1099-R", "/form1099Miscs": "1099-MISC", "/socialSecurityReports": "SSA-1099", "/cdccCareProviders": "Care provider", "/hsaDistributions": "HSA distribution", "/filersWithHsa": "Filer", "/1095As": "1095-A" };
  // Form 1040 lines in the order the IRS's PDF mapping fills them (backend/src/main/resources/pdf/2024/IRS1040/en/configuration.yml).
  // The fourth entry marks lines shown even when zero.
  const LINES = [
    ["1a", "Wages from Forms W-2", "/wages"], ["1z", "Total wages", "/employerIncomeSubtotal"], ["2b", "Taxable interest", "/interestIncome"],
    ["5b", "Pensions and annuities", "/taxablePensionsAndAnnuitiesDisplay"], ["6b", "Taxable Social Security", "/taxableSocialSecurityBenefits"],
    ["8", "Other income (Schedule 1)", "/otherIncome"], ["9", "Total income", "/totalIncome", 1], ["10", "Adjustments", "/adjustmentsToIncome"],
    ["11", "Adjusted gross income", "/agi", 1], ["12", "Standard deduction", "/standardOrItemizedDeductions", 1], ["15", "Taxable income", "/taxableIncome", 1],
    ["16", "Tax", "/tentativeTaxFromTaxableIncome", 1], ["19", "Child tax credit and credit for other dependents", "/totalCtcAndOdc"],
    ["20", "Other credits (Schedule 3)", "/line8OfSchedule3"], ["22", "Tax after credits", "/taxLessNonRefundableCredits"],
    ["23", "Other taxes (Schedule 2)", "/line21OfSchedule2"], ["24", "Total tax", "/totalTax", 1], ["25d", "Federal tax withheld", "/totalWithholding", 1],
    ["26", "Estimated tax payments", "/estimatedAndFromLastYear"], ["27", "Earned income credit", "/earnedIncomeCredit"], ["28", "Additional child tax credit", "/additionalCtc"],
    ["31", "Other refundable credits (Schedule 3)", "/otherPaymentsAndRefundableCreditsTotal"], ["33", "Total payments", "/totalPayments", 1],
    ["34", "Overpaid (refund)", "/overpayment", 1], ["37", "Amount you owe", "/balanceDue", 1]
  ];
  const STRONG = new Set(["/agi", "/totalTax", "/overpayment", "/balanceDue"]);
  const MASK = new Set(["Tin", "Pin", "IpPin", "BankAccount", "PhoneNumber", "Ein"]);
  const PROPOSED = [{ proposed: "state", cat: "complete" }, { proposed: "data", cat: "complete" }];

  let DICT, FLOW, COPY, FACTS, BYPATH, USEDBY, RETURNS, TOTAL_SCREENS = 0, GATES = 0;
  let g = null, current = null, screens = [], pos = 0, tab = "return", selected = "/overpayment", query = "";
  let baseline = {}, was = {}, flash = false, status = "", edits = 0;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const money = (s) => { const n = Number(s); return (n < 0 ? "−$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const keyOf = (x) => x.screen.route + "|" + (x.id || "");

  // ---------- values and copy ----------
  function fmt(v) {
    if (v === undefined || v === null) return "";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    const e = R.enumParts(v);
    if (e) return COPY["fields." + e.optionsPath + "." + e.value] || (/^[a-z]{2}$/.test(e.value) ? e.value.toUpperCase() : e.value);
    const s = String(v);
    if (/^-?\d+\.\d\d$/.test(s)) return money(s);
    if (/^CollectionItem\(/.test(s)) return "(linked item)";
    if (/^(Collection|List)\(/.test(s)) return "(list)";
    return s;
  }
  // Direct File's copy: fill {{/fact}} placeholders from the graph, keep <strong> and <em>, keep the text of every other tag.
  function rich(text, id) {
    const filled = String(text).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, p) => {
      p = p.trim();
      if (!p.startsWith("/")) return "";
      const r = R.get(g, p, id);
      return r.hasValue ? "\u0000" + fmt(r.value) + "\u0001" : "…";
    }).replace(/<\/?(?!strong\b|em\b|br\b)[a-zA-Z][^>]*>/g, "");
    return esc(filled).replace(/&lt;(\/?)(strong|em)&gt;/g, "<$1$2>").replace(/&lt;br\s*\/?&gt;/g, "<br>").replace(/\u0000/g, "<b>").replace(/\u0001/g, "</b>");
  }
  const copyHTML = (key, id) => (typeof COPY[key] === "string" ? rich(COPY[key], id) : null);
  function blocksHTML(key, id) {
    const blocks = COPY[key];
    if (!Array.isArray(blocks)) return "";
    return blocks.map((b) => Array.isArray(b) ? `<ul class="info">${b.map((li) => `<li>${rich(li, id)}</li>`).join("")}</ul>` : `<p class="info">${rich(b, id)}</p>`).join("");
  }
  // Section names can hold placeholders too ("Your {{/taxYear}} taxes").
  const plainCopy = (key, fallback) => COPY[key] ? rich(COPY[key], null).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"') : fallback;
  const catName = (c) => plainCopy("checklist./flow/" + c + ".heading", c);
  const subName = (s) => plainCopy("checklist./flow/" + s + ".heading", s);

  // ---------- start ----------
  async function boot() {
    const steps = $("steps");
    const step = (t) => { const li = document.createElement("li"); li.textContent = t; steps.appendChild(li); return li; };
    try {
      if (!window.DFFactGraph) throw new Error("the engine script didn't load");
      step("Fact Graph engine (Scala compiled to JavaScript)").className = "done";
      const s2 = step("Rules, interview, wording and test returns");
      const [dict, facts, flow, copy, rets] = await Promise.all(["dictionary.json", "facts.json", "flow.json", "copy.json", "returns.json"].map((f) =>
        fetch(f).then((r) => { if (!r.ok) throw new Error(`${f} answered ${r.status}`); return r.json(); })));
      s2.className = "done";
      const s3 = step(`Building the dictionary of ${facts.length.toLocaleString()} tax rules`);
      await new Promise((r) => setTimeout(r, 20));
      DICT = R.buildDictionary(dict);
      s3.className = "done";
      FLOW = flow; COPY = copy; FACTS = facts; RETURNS = rets;
      BYPATH = Object.fromEntries(FACTS.map((f) => [f.p, f]));
      USEDBY = {};
      for (const f of FACTS) for (const d of f.deps) (USEDBY[d] = USEDBY[d] || []).push(f.p);
      const count = (n) => { if (n.t === "Screen") TOTAL_SCREENS++; if (n.t === "Gate") GATES++; (n.kids || []).forEach(count); };
      count(FLOW);
      renderCounts();
      renderPersonas();
      load(RETURNS[0].id);
    } catch (e) {
      $("screen").innerHTML = `<div class="loading"><p class="err">The page couldn't start: ${esc(e.message)}.</p><p>Reload the page to try again.</p></div>`;
    }
  }

  function renderCounts() {
    const modules = new Set(FACTS.map((f) => f.m)).size;
    $("counts").innerHTML = `<span><b>${FACTS.length.toLocaleString()}</b>tax rules (facts)</span><span><b>${modules}</b>rule modules</span><span><b>${TOTAL_SCREENS}</b>interview screens</span><span><b>${GATES}</b>branch points</span>`;
  }
  function renderPersonas() {
    $("personas").innerHTML = `<span class="label">IRS test returns:</span>` + RETURNS.map((r) =>
      `<button type="button" class="chip" data-ret="${esc(r.id)}" aria-pressed="false">${esc(r.name)} <small>${esc(r.sub)}</small></button>`).join("");
    $("personas").querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => load(c.dataset.ret)));
  }

  function load(id) {
    g = R.newGraph(DICT, RETURNS.find((r) => r.id === id).facts);
    current = id;
    screens = R.walk(g, FLOW);
    pos = 0; baseline = snapshot(); was = {}; flash = false; status = ""; edits = 0;
    $("personas").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.ret === id)));
    render(false);
  }

  // ---------- the interview ----------
  const list = () => screens.concat(PROPOSED);

  function render(focus) {
    const all = list();
    if (pos >= all.length) pos = all.length - 1;
    const s = all[pos];
    renderChecklist(s);
    renderToolbar(s);
    $("screen").innerHTML = s.proposed ? proposedHTML(s.proposed) : screenHTML(s);
    $("status").innerHTML = status;
    $("back").disabled = pos === 0;
    $("next").disabled = pos === all.length - 1;
    $("pos").textContent = s.proposed ? `Proposed screen ${pos - screens.length + 1} of ${PROPOSED.length}` : `Screen ${pos + 1} of ${screens.length}`;
    if (!s.proposed) wireScreen(s);
    renderPanel();
    if (focus) { const h = $("screen").querySelector("h2"); if (h) { h.setAttribute("tabindex", "-1"); h.focus(); } }
  }

  function renderChecklist(s) {
    const cats = [...new Set(screens.map((x) => x.cat))];
    const ci = cats.indexOf(s.cat);
    $("checklist").innerHTML = cats.map((c, i) => {
      const n = screens.filter((x) => x.cat === c).length;
      return `<button type="button" data-cat="${esc(c)}" class="${i < ci ? "done" : i === ci ? "current" : ""}"${i === ci ? ' aria-current="step"' : ""}><b>${esc(catName(c))}</b><span>${plural(n, "screen", "screens")}</span></button>`;
    }).join("");
    $("checklist").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { status = ""; pos = screens.findIndex((x) => x.cat === b.dataset.cat); render(true); }));
  }

  function renderToolbar(s) {
    const name = R.get(g, "/primaryFiler/fullName");
    const subs = [];
    screens.forEach((x, i) => { if (!subs.length || subs[subs.length - 1].sub !== x.sub) subs.push({ sub: x.sub, i }); });
    const curSub = s.proposed ? "" : s.sub;
    $("toolbar").innerHTML = `<span class="who">Test taxpayer: <b>${esc(name.hasValue ? fmt(name.value) : "unnamed")}</b> <span class="mono">${esc(current)}.json</span></span>
      <label class="jump"><span>Jump to</span><select id="jump">${subs.map((x) => `<option value="${x.i}"${x.sub === curSub ? " selected" : ""}>${esc(catName(x.sub.split("/")[0]))}: ${esc(subName(x.sub))}</option>`).join("")}${s.proposed ? '<option selected value="">Proposed screens</option>' : ""}</select></label>
      ${edits ? `<button type="button" class="btn ghost small-btn" id="reset">Undo ${plural(edits, "change", "changes")}</button>` : ""}`;
    $("jump").addEventListener("change", (e) => { if (e.target.value === "") return; status = ""; pos = Number(e.target.value); render(true); });
    if ($("reset")) $("reset").addEventListener("click", () => load(current));
  }

  function screenHTML(s) {
    const sc = s.screen;
    const vis = sc.items.filter((it) => R.all(g, it.c, s.id));
    const heads = vis.filter((it) => it.k === "h").map((it) => copyHTML(it.key, s.id)).filter(Boolean);
    const item = s.item ? `<span class="tag proto">${esc(ITEM[s.item.coll] || "Item")} ${s.item.index + 1} of ${s.item.count}</span>` : "";
    let html = `<div class="crumbs"><span>${esc(catName(s.cat))} › ${esc(subName(s.sub))}</span>${item}${sc.ko ? '<span class="tag ko">Knockout</span>' : ""}</div>`;
    html += heads.length ? `<h2>${heads[0]}</h2>` : `<h2 class="quiet">${esc(subName(s.sub))}</h2>`;
    heads.slice(1).forEach((h) => { html += `<p class="sub">${h}</p>`; });
    let i = 0;
    for (const it of vis) {
      if (it.k === "s") { const t = copyHTML(it.key, s.id); if (t) html += `<p class="sub">${t}</p>`; }
      else if (it.k === "i") html += blocksHTML(it.key, s.id);
      else if (it.k === "f") html += fieldHTML(it, s.id, i++);
    }
    if (sc.ko) html += `<div class="callout warn"><b>Direct File stops here.</b><p>This is a knockout screen: the answers put the return outside what Direct File could file, so the interview ends. Go back and change the answer to continue.</p></div>`;
    else if (!i) html += `<p class="small">No questions on this screen.</p>`;
    html += `<p class="small">Direct File screen <span class="mono">${esc(sc.route)}</span></p>`;
    return html;
  }

  function fieldHTML(f, id, i) {
    const fid = "f" + i;
    const fact = BYPATH[f.path];
    const r = R.get(g, f.path, id);
    const label = copyHTML("fields." + f.path + f.suf + ".name", id) || copyHTML("fields." + f.path + ".name", id);
    const labelled = label ? ` aria-labelledby="${fid}-q"` : ` aria-label="Answer"`;
    let control;
    if (f.ft === "Boolean") {
      const yes = copyHTML("fields." + f.path + f.suf + ".boolean.yes", id) || "Yes";
      const no = copyHTML("fields." + f.path + f.suf + ".boolean.no", id) || "No";
      control = `<div class="opts" role="radiogroup"${labelled}>
        <label class="opt"><input type="radio" name="${fid}" value="true" data-i="${i}"${r.hasValue && r.value === true ? " checked" : ""}> <span>${yes}</span></label>
        <label class="opt"><input type="radio" name="${fid}" value="false" data-i="${i}"${r.hasValue && r.value === false ? " checked" : ""}> <span>${no}</span></label></div>`;
    } else if (f.ft === "Dollar") {
      control = `<div class="money"><span aria-hidden="true">$</span><input type="text" inputmode="decimal" id="${fid}" data-i="${i}" value="${r.hasValue ? esc(String(r.value)) : ""}"${labelled}></div>`;
    } else if (f.ft === "Enum" && fact && fact.eo) {
      const cur = r.hasValue ? (R.enumParts(r.value) || {}).value : "";
      const choices = R.enumChoices(g, fact.eo.optionsPath, id) || fact.eo.values;
      const label2 = (v) => COPY["fields." + f.path + "." + fact.eo.optionsPath + f.suf + "." + v] || COPY["fields." + fact.eo.optionsPath + "." + v] || v;
      control = `<select id="${fid}" data-i="${i}"${labelled}>${cur ? "" : '<option value="">Choose one</option>'}${choices.map((v) =>
        `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(label2(v).replace(/<[^>]+>/g, ""))}</option>`).join("")}</select>`;
    } else {
      const masked = MASK.has(f.ft) || /email|phone/i.test(f.path);
      const text = !r.hasValue ? "Not answered" : masked ? "Test value hidden" : fmt(r.value);
      control = `<div class="ro${!r.hasValue || masked ? " empty" : ""}"${labelled}>${esc(text)}</div>`;
    }
    return `<div class="field">${label ? `<span class="q" id="${fid}-q">${label}</span>` : ""}${control}
      <button type="button" class="rulelink" data-fact="${esc(f.path)}">See the rule <code>${esc(f.path)}</code></button></div>`;
  }

  function wireScreen(s) {
    const fields = s.screen.items.filter((it) => it.k === "f" && R.all(g, it.c, s.id));
    $("screen").querySelectorAll("[data-i]").forEach((el) => {
      const f = fields[Number(el.dataset.i)];
      const commit = () => {
        let raw = el.value;
        if (f.ft === "Boolean") raw = el.value === "true";
        else if (f.ft === "Dollar") raw = raw.replace(/[$,\s]/g, "");
        if (raw === "") return;
        const fact = BYPATH[f.path];
        const res = R.setValue(g, f.path, s.id, f.ft, raw, fact && fact.eo ? fact.eo.optionsPath : null);
        if (!res.ok) { status = `<span class="err">Direct File's rules don't accept “${esc(el.value)}” here.</span>`; render(false); return; }
        afterChange(s, res.limits);
      };
      el.addEventListener("change", commit);
      if (el.tagName === "INPUT" && el.type === "text") el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } });
    });
    $("screen").querySelectorAll(".rulelink").forEach((b) => b.addEventListener("click", () => openRule(b.dataset.fact)));
  }

  function afterChange(s, limits) {
    edits++;
    const before = new Set(screens.map(keyOf));
    screens = R.walk(g, FLOW);
    const after = new Set(screens.map(keyOf));
    const added = [...after].filter((k) => !before.has(k)).length;
    const removed = [...before].filter((k) => !after.has(k)).length;
    const idx = screens.findIndex((x) => keyOf(x) === keyOf(s));
    pos = idx >= 0 ? idx : Math.min(pos, screens.length - 1);
    const now = snapshot();
    const moved = Object.keys(now).filter((k) => now[k] !== baseline[k]);
    was = Object.fromEntries(moved.map((k) => [k, baseline[k]]));
    flash = true;
    const lines = moved.length ? `${plural(moved.length, "line", "lines")} of the 1040 now differ from the test return.` : "The 1040 is the same as the test return.";
    const branch = added || removed ? ` The interview changed: <span class="up">${plural(added, "screen", "screens")} added</span>, <span class="down">${removed} removed</span>.` : "";
    const ko = screens.length && screens[screens.length - 1].screen.ko ? ` <b>This answer knocks the return out of Direct File.</b>` : "";
    const warn = (limits || []).length ? ` <span class="err">Direct File would flag this: ${esc(limits.map((l) => `${l.name} ${l.limit}`).join("; "))}.</span>` : "";
    status = `Saved. ${lines}${branch}${ko}${warn}`;
    if (tab !== "rules") tab = "return";
    render(false);
  }

  function proposedHTML(kind) {
    if (kind === "state") {
      const st = R.get(g, "/filerResidenceAndIncomeState");
      const name = st.hasValue ? fmt(st.value) : "your state";
      const noTax = R.get(g, "/scopedStateDoesNotHavePersonalIncomeTax").value === true;
      const handoff = R.get(g, "/hasStateFilingIntegration").value === true;
      const built = noTax
        ? `${esc(name)} has no personal income tax, so for this return Direct File was done after the federal return.`
        : handoff
          ? `Direct File ended by offering to send this return's answers, with the taxpayer's permission, to ${esc(name)}'s own filing tool through its State API (<span class="mono">state-api/</span> in the repository). The state's tool then asked its own questions.`
          : `Direct File pointed the taxpayer to ${esc(name)}'s own filing options; the state return started from scratch.`;
      return `<div class="crumbs"><span class="tag proposed">Proposed</span><span>After the federal return</span></div>
        <h2>Build the state return on top of this one</h2>
        <div class="callout plain"><span><span class="tag real">As built</span></span><p>${built}</p>
        <p class="small">From the rules for this return: <code>/scopedStateDoesNotHavePersonalIncomeTax</code> is ${noTax ? "true" : "false"} and <code>/hasStateFilingIntegration</code> is ${handoff ? "true" : "false"}.</p></div>
        <div class="callout proposed"><p><b>Our proposal:</b> a state publishes only how its rules differ from the federal ones, written as facts that extend this same dictionary: its deduction, its credits and its extra questions. Every federal answer and rule carries over unchanged. When the federal rules change each year, every state picks up the change and reviews only its own part.</p>
        <p>The same idea works for forms in general. Our team's form tool already lets a state form extend a federal one.</p></div>`;
    }
    return `<div class="crumbs"><span class="tag proposed">Proposed</span><span>Before signing</span></div>
      <h2>Who will see this return?</h2>
      <p class="sub">Direct File explained what it asked for, but not where a return goes once it's filed. The Privacy Act already requires that information to be published, so the service could show it here, before the taxpayer signs. The “Your data” tab shows what it would say.</p>
      <p class="small">This is the end of the walkthrough. Choose another test return above, or go back and change an answer.</p>`;
  }

  // ---------- side panel ----------
  function snapshot() {
    const o = {};
    for (const [, , p] of LINES) { const r = R.get(g, p); o[p] = r.complete ? String(r.value) : ""; }
    return o;
  }
  function renderPanel() {
    document.querySelectorAll(".tabs button").forEach((b) => { const on = b.id === "tab-" + tab; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
    const P = $("panel");
    P.innerHTML = tab === "return" ? returnHTML() : tab === "rules" ? rulesHTML() : tab === "data" ? dataHTML() : aboutHTML();
    P.querySelectorAll("[data-fact]").forEach((b) => b.addEventListener("click", () => openRule(b.dataset.fact)));
    const q = $("q");
    if (q) q.addEventListener("input", () => {
      query = q.value;
      $("results").outerHTML = resultsHTML();
      P.querySelectorAll("#results [data-fact]").forEach((b) => b.addEventListener("click", () => openRule(b.dataset.fact)));
    });
    if (flash) { flash = false; requestAnimationFrame(() => requestAnimationFrame(() => P.querySelectorAll(".line.flash").forEach((el) => el.classList.remove("flash")))); }
  }

  function returnHTML() {
    const fs = R.get(g, "/filingStatus");
    const due = R.get(g, "/balanceDue");
    const owe = due.complete && Number(due.value) > 0;
    const amt = owe ? due : R.get(g, "/overpayment");
    const rows = LINES.filter(([, , p, always]) => { const r = R.get(g, p); return always || p in was || (r.complete && Number(r.value) !== 0); })
      .map(([ln, label, p]) => {
        const r = R.get(g, p);
        const v = r.complete ? esc(fmt(r.value)) : `<span class="state incomplete">Incomplete</span>`;
        const old = p in was && was[p] !== "" ? `<span class="was">${esc(fmt(was[p]))}</span>` : "";
        return `<div class="line${STRONG.has(p) ? " strong" : ""}${p in was && flash ? " flash" : ""}"><span class="ln">${ln}</span><span>${esc(label)}</span><span class="lv">${old}${v}</span>
          <span class="lp"><button type="button" data-fact="${p}">${p}</button></span></div>`;
      }).join("");
    const statusText = fs.hasValue ? fmt(fs.value).replace(/^./, (c) => c.toUpperCase()) : "Filing status incomplete";
    return `<div><span class="tag real">IRS code</span></div>
      <div class="result"><span class="small">${owe ? "Amount owed" : "Refund"} · ${esc(statusText)}</span><span class="big ${owe ? "" : "good"}">${amt.complete ? fmt(amt.value) : "—"}</span></div>
      <p class="small">Form 1040 lines, each filled by the fact the IRS's own PDF mapping names, computed live by Direct File's engine.${Object.keys(was).length ? " Struck-through numbers are the test return's original values." : ""} Click a fact name to read its rule.</p>
      <div class="lines">${rows}</div>`;
  }

  function resultsHTML() {
    const q = query.trim().toLowerCase();
    if (!q) return `<div class="results" id="results" hidden></div>`;
    const score = (f) => (f.n || "").toLowerCase().includes(q) ? 0 : f.p.toLowerCase().includes(q) ? 1 : (f.d || "").toLowerCase().includes(q) ? 2 : 9;
    const hits = FACTS.map((f) => [score(f), f]).filter(([s]) => s < 9).sort((a, b) => a[0] - b[0]).slice(0, 40).map(([, f]) => f);
    return `<div class="results" id="results">${hits.length ? hits.map((f) => `<button type="button" data-fact="${esc(f.p)}"><span class="rn">${esc(f.n || f.p)}</span><span class="rp">${esc(f.p)} · ${esc(f.m)}</span></button>`).join("") : `<p class="small none">No rule matches “${esc(query)}”.</p>`}</div>`;
  }

  // A fact's value on this return: one value, or one per item for a fact inside a collection.
  function valuesOf(path) {
    if (!path.includes("*")) return [{ label: "This return", r: R.get(g, path) }];
    const coll = path.slice(0, path.indexOf("/*"));
    return R.collectionIds(g, coll).map((id, i) => ({ label: (ITEM[coll] || coll) + " " + (i + 1), r: R.get(g, path, id) }));
  }
  const stateOf = (r) => r.complete ? ["complete", "Complete"] : r.hasValue ? ["placeholder", "Placeholder"] : ["incomplete", "Incomplete"];
  const valueText = (f, r) => !r.hasValue ? "—" : f && MASK.has(f.t) ? "Test value hidden" : fmt(r.value);

  function rulesHTML() {
    const f = BYPATH[selected];
    let html = `<div><span class="tag real">IRS code</span></div>
      <h3>The Fact Graph</h3>
      <p>Direct File stored tax law as ${FACTS.length.toLocaleString()} <em>facts</em> written in XML. A fact is either an answer (writable) or worked out from other facts (derived). A derived fact stays incomplete until everything it depends on is known, so the engine can reason about a return that's half done. Search for any rule, or click a fact anywhere on the page.</p>
      <div class="search"><input id="q" type="search" placeholder="Search, e.g. earned income" value="${esc(query)}" aria-label="Search the rules"></div>
      ${resultsHTML()}`;
    if (!f) return html;
    const vals = valuesOf(f.p);
    const deps = f.deps.filter((d) => BYPATH[d]);
    const used = (USEDBY[f.p] || []).filter((d) => BYPATH[d]);
    let explain = "";
    if (vals.length === 1 && !vals[0].r.complete && !f.t) {
      try {
        const sol = Array.from(g.explainAndSolve(f.p) || []).slice(0, 3).map((a) => Array.from(a).slice(0, 4));
        if (sol.length) explain = `<p class="small"><b>Answers that would complete it:</b> ${sol.map((a) => a.map((p) => `<code>${esc(p)}</code>`).join(" + ")).join("; or ")}</p>`;
      } catch (e) { /* not every fact can be explained */ }
    }
    html += `<div class="fact">
      <div class="fact-h"><h3>${esc(f.n || f.p)}</h3><span class="path">${esc(f.p)}</span>
        <div class="chips"><span class="tag proto">module: ${esc(f.m)}</span><span class="tag proto">${f.t ? "answer · " + esc(f.t) : "derived"}</span></div></div>
      ${f.d ? `<p>${esc(f.d)}</p>` : ""}
      <div class="vals">${vals.length ? vals.map((v) => { const [cls, txt] = stateOf(v.r); return `<div><span>${esc(v.label)} <span class="state ${cls}">${txt}</span></span><b>${esc(valueText(f, v.r))}</b></div>`; }).join("") : `<div><span>None of these on this return</span><b>—</b></div>`}</div>
      ${explain}
      ${deps.length ? `<p class="small"><b>Depends on ${deps.length}</b></p><div class="chips">${deps.map(depChip).join("")}</div>` : ""}
      ${used.length ? `<p class="small"><b>Used by ${used.length}</b></p><div class="chips">${used.slice(0, 40).map(depChip).join("")}${used.length > 40 ? `<span class="small">and ${used.length - 40} more</span>` : ""}</div>` : ""}
      <p class="small"><b>The rule as written</b> in <code>${esc(f.m)}.xml</code>:</p>
      <pre class="xml">${esc(f.x || "This fact has no block of its own in the XML.")}</pre>
    </div>`;
    return html;
  }
  function depChip(p) {
    let v = "";
    if (!p.includes("*")) { const r = R.get(g, p); v = r.complete ? valueText(BYPATH[p], r) : "incomplete"; if (v.length > 18) v = v.slice(0, 17) + "…"; }
    return `<button type="button" class="dep" data-fact="${esc(p)}">${esc(p)}${v ? `<span class="dv">${esc(v)}</span>` : ""}</button>`;
  }

  function dataHTML() {
    return `<div><span class="tag proposed">Proposed</span></div>
      <h3>What happens to the information</h3>
      <p>The Privacy Act requires an agency to publish a <em>system of records notice</em> for each system that holds records about people, saying what it holds and who it may be shared with. Those notices exist for tax returns. They are just hard to find. We propose showing them in the product, at the moment of filing.</p>
      <div class="sys"><span class="num">IRS 22.062</span><b>Electronic Filing Records</b><p>Returns filed electronically, including the details of the transmission.</p></div>
      <div class="sys"><span class="num">IRS 24.030</span><b>Customer Account Data Engine Individual Master File</b><p>The IRS's master record of each individual taxpayer's account: returns, payments, refunds and notices.</p></div>
      <p class="small">Both are among the IRS notices Treasury amended on December 11, 2014 (<a href="https://www.federalregister.gov/d/2014-29134" target="_blank" rel="noopener">Federal Register 2014-29134</a>). Matching a service to the notices that cover it is our team's reading, not an IRS statement.</p>
      <h3>When it's shared</h3>
      <ul class="plain">
        <li><b>The taxpayer's state, if they choose.</b> Direct File's State API sent the federal answers to the state's tool only on request.</li>
        <li><b>Within limits set by law.</b> Federal tax law (26 U.S.C. § 6103) keeps return information confidential and lists the exceptions, such as state tax agencies administering their own taxes.</li>
        <li><b>Research about the service.</b> The IRS's privacy impact assessments for Direct File's usability studies and customer survey cite IRS 00.001 (correspondence files) and IRS 10.004 (stakeholder relationship files).</li>
      </ul>
      <p class="small">We found these notices with a search tool for system of records notices that one of us built.</p>`;
  }

  function aboutHTML() {
    return `<h3>What's real here</h3>
      <ul class="plain">
        <li><b>The engine.</b> Direct File's Fact Graph, written in Scala and compiled to JavaScript: the prebuilt copy in the repository (<code>df-client/js-factgraph-scala</code>), minified but otherwise unchanged.</li>
        <li><b>The rules.</b> All ${FACTS.length.toLocaleString()} facts of the XML fact dictionary, converted the way the IRS's build script converts them. “The rules” tab shows each one's source text.</li>
        <li><b>The interview.</b> ${TOTAL_SCREENS} screens and ${GATES} branch points from the repository's <code>flow.tsx</code>. Which screens appear follows the condition logic of its <code>Condition.ts</code>, and a knockout ends the interview as it did in Direct File.</li>
        <li><b>The wording.</b> Headings, explanations, questions and answer choices are Direct File's English text (<code>locales/en.yaml</code>). Answer choices are the ones the rules offer for this return.</li>
        <li><b>The people.</b> Test returns from the repository (<code>backend/src/test/resources/scenarios</code>). Names, numbers and addresses are invented, and identifying numbers are hidden anyway.</li>
        <li><b>The 1040 lines.</b> From the IRS's PDF field mapping for the 2024 Form 1040.</li>
      </ul>
      <h3>What isn't</h3>
      <ul class="plain">
        <li>This page draws the screens itself. Help pop-ups, alerts, summary tables and lists the app assembled at run time are left out.</li>
        <li>Yes/no answers, dollar amounts and multiple-choice answers can be changed. Names, dates and identifying numbers can't. People and forms can't be added or removed.</li>
        <li>No identity checks, signing, filing or state hand-off. Nothing leaves the browser.</li>
        <li>Conditions that depend on IRS data imports or feature flags are treated as off.</li>
      </ul>
      <p><a href="https://github.com/IRS-Public/direct-file" target="_blank" rel="noopener">github.com/IRS-Public/direct-file</a> · public domain (CC0) · archived</p>`;
  }

  function openRule(path) {
    selected = path;
    tab = "rules";
    renderPanel();
    $("panel").scrollTop = 0;
    if (window.matchMedia("(max-width: 920px)").matches) document.querySelector("aside.side").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- controls ----------
  const tabs = [...document.querySelectorAll(".tabs button")];
  tabs.forEach((b, i) => {
    b.addEventListener("click", () => { tab = b.id.slice(4); renderPanel(); });
    b.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      const t = tabs[(i + d + tabs.length) % tabs.length];
      tab = t.id.slice(4); renderPanel(); t.focus();
    });
  });
  $("next").addEventListener("click", () => { status = ""; pos++; render(true); });
  $("back").addEventListener("click", () => { status = ""; pos--; render(true); });

  boot();
})();

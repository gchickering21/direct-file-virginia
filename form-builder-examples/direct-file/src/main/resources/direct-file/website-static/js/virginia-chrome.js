// The Virginia chrome's two small fixes that need the DOM.
//
// THE PAGE'S <h1>. The scaffold's page.html writes "Direct File" as every page's h1 and it is not a
// fragment this application can replace. On the Virginia routes the masthead names whose return
// this is, so the h1's text is set from the masthead's name (a locale string, virginia.masthead.name)
// and it stays visually hidden (styles/components/virginia.css).
const name = document.querySelector('.va-masthead__name')
const h1 = document.querySelector('main > h1')
if (name && h1 && name.textContent.trim()) h1.textContent = name.textContent.trim()

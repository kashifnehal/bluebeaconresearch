import assert from "node:assert/strict";
import {
  escapeHtml,
  documentWrapper,
  masthead,
  preheader,
  sectionLabel,
  eventExposureEvidence,
  tagList,
  table,
  button,
  chart,
  footer,
} from "./email-layout.js";

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

runTest("escapeHtml escapes the five reserved characters", () => {
  assert.equal(escapeHtml(`<script>alert('&"')</script>`), "&lt;script&gt;alert(&#39;&amp;&quot;&#39;)&lt;/script&gt;");
});

runTest("documentWrapper includes both color-scheme metas and the escaped title", () => {
  const html = documentWrapper("Blue <b>Beacon</b>", "<p>body</p>");
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<meta name="color-scheme" content="light dark">/);
  assert.match(html, /<meta name="supported-color-schemes" content="light dark">/);
  assert.match(html, /<title>Blue &lt;b&gt;Beacon&lt;\/b&gt;<\/title>/);
  assert.match(html, /<p>body<\/p>/);
});

runTest("masthead escapes both lines and contains no script tag", () => {
  const html = masthead("BLUE BEACON RESEARCH<script>", "Daily Brief · 3 Nov 2026 UTC");
  assert.ok(!html.includes("<script>"));
  assert.match(html, /BLUE BEACON RESEARCH&lt;script&gt;/);
  assert.match(html, /Daily Brief/);
});

runTest("preheader hides the text visually but keeps it in the markup, escaped", () => {
  const html = preheader(`First item <title>`);
  assert.match(html, /display:none/);
  assert.match(html, /First item &lt;title&gt;/);
});

runTest("sectionLabel escapes its label", () => {
  assert.match(sectionLabel("Event <x>"), /Event &lt;x&gt;/);
});

runTest("eventExposureEvidence renders all three rows in order", () => {
  const html = eventExposureEvidence({ event: "E", exposure: "X", evidence: "V" });
  const eventIdx = html.indexOf(">Event<");
  const exposureIdx = html.indexOf(">Exposure<");
  const evidenceIdx = html.indexOf(">Evidence<");
  assert.ok(eventIdx >= 0 && exposureIdx > eventIdx && evidenceIdx > exposureIdx);
});

runTest("tagList strips direction arrows even if an item contains one", () => {
  const html = tagList(["USOIL ↑", "EURUSD →", "WHEAT"]);
  assert.ok(!/[↑↓↕→←]/.test(html), "no arrow glyph should survive in tagList output");
  assert.match(html, /USOIL/);
  assert.match(html, /EURUSD/);
  assert.match(html, /WHEAT/);
});

runTest("tagList escapes and contains no script tag for a hostile item", () => {
  const html = tagList([`<script>alert(1)</script>`]);
  assert.ok(!html.includes("<script>"));
});

runTest("table renders a header row and one row per data row, escaping header text", () => {
  const html = table(["Market <x>", "Line"], [["USOIL", "Gulf supply risk"], ["WHEAT", "Export curbs"]]);
  assert.match(html, /Market &lt;x&gt;/);
  assert.match(html, /USOIL/);
  assert.match(html, /WHEAT/);
  assert.equal((html.match(/<tr>/g) ?? []).length, 3); // 1 head + 2 body rows
});

runTest("button renders a navy table-cell link, not an <img>", () => {
  const html = button("Read the brief", "https://example.com/brief");
  assert.ok(!html.includes("<img"));
  assert.match(html, /background:#0A2643/);
  assert.match(html, /href="https:\/\/example\.com\/brief"/);
  assert.match(html, />Read the brief</);
});

runTest("button escapes a hostile label and href attribute", () => {
  const html = button(`<script>1</script>`, `https://example.com/"><script>1</script>`);
  assert.ok(!html.includes("<script>"));
});

runTest("chart renders nothing when src is undefined", () => {
  assert.equal(chart({ alt: "A", caption: "C", sourceLine: "S" }), "");
});

runTest("chart renders the image, caption, alt text, and source line when src is set", () => {
  const html = chart({ src: "https://example.com/chart.png", alt: "Oil price chart", caption: "Brent, 30d", sourceLine: "Source: EIA" });
  assert.match(html, /<img src="https:\/\/example\.com\/chart\.png"/);
  assert.match(html, /alt="Oil price chart"/);
  assert.match(html, /Brent, 30d/);
  assert.match(html, /Source: EIA/);
});

runTest("footer omits the address line entirely when address is not set", () => {
  const html = footer({ reason: "You're subscribed.", unsubscribeUrl: "https://e.com/u", preferencesUrl: "https://e.com/p" });
  assert.ok(!html.includes("<br>"));
});

runTest("footer renders the address line only when address is set", () => {
  const html = footer({
    reason: "You're subscribed.",
    unsubscribeUrl: "https://e.com/u",
    preferencesUrl: "https://e.com/p",
    address: "123 Main St",
  });
  assert.match(html, /123 Main St/);
});

runTest("no helper output contains a literal <script> tag given hostile plain-text input", () => {
  const hostile = `<script>document.location='https://evil.example'</script>`;
  const outputs = [
    masthead(hostile, hostile),
    preheader(hostile),
    sectionLabel(hostile),
    tagList([hostile]),
    table([hostile], [[escapeHtml(hostile)]]),
    button(hostile, "https://example.com"),
    chart({ src: "https://example.com/c.png", alt: hostile, caption: hostile, sourceLine: hostile }),
    footer({ reason: hostile, unsubscribeUrl: "https://e.com/u", preferencesUrl: "https://e.com/p", address: hostile }),
    documentWrapper(hostile, "<p>ok</p>"),
  ];
  for (const html of outputs) {
    assert.ok(!html.includes("<script>"), `found a literal <script> tag in:\n${html}`);
  }
});

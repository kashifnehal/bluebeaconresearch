export function LegalDisclaimerFooter() {
  return (
    <footer
      data-testid="legal-disclaimer-footer"
      className="px-4 py-4 md:px-8 border-t border-[#2a2a2a] text-center text-[11px] leading-relaxed text-[#86948a] font-mono"
    >
      <p>
        Blue Beacon Research provides news-derived signals and market-impact analysis for informational and research
        purposes only. Nothing on this platform constitutes investment, legal, accounting, or tax advice, and nothing
        here is a recommendation to buy, sell, or hold any security, commodity, or currency. BBR is not a registered
        investment adviser or broker-dealer.
      </p>
      <p className="mt-2">
        <a
          href="https://www.gdeltproject.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-[#bbcac0]"
        >
          Event data from the GDELT Project
        </a>
      </p>
    </footer>
  );
}

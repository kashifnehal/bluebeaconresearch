import { FeedbackForm } from "@/components/FeedbackForm";
import { HELP_FAQ_ITEMS } from "@/lib/help-faq";

export const metadata = {
  title: "Help — Blue Beacon Research",
  description: "How Blue Beacon Research actually works today, plus a way to send feedback.",
};

export default function HelpPage() {
  return (
    <div className="p-8 md:p-10 min-h-screen bg-surface-container-lowest text-on-surface">
      <div className="max-w-3xl">
        <h1 className="text-4xl font-extrabold tracking-tighter font-headline text-white">
          Help
        </h1>
        <p className="text-on-surface/60 mt-2 font-body font-medium">
          Straight answers about what the product does today. This is not a live
          help desk — use the form at the bottom to send feedback or a bug report.
        </p>

        <div className="mt-10 space-y-8">
          {HELP_FAQ_ITEMS.map((item) => (
            <section
              key={item.id}
              id={item.id}
              className="border-b border-outline-variant/20 pb-8"
            >
              <h2 className="text-lg font-bold text-white font-headline">{item.question}</h2>
              <p className="mt-3 text-sm text-on-surface/70 leading-relaxed">{item.answer}</p>
              {item.certaintyNote ? (
                <p className="mt-3 text-[11px] font-mono text-on-surface/45 leading-relaxed">
                  Note: {item.certaintyNote}
                </p>
              ) : null}
            </section>
          ))}
        </div>

        <section className="mt-12 mb-16">
          <h2 className="text-lg font-bold text-white font-headline">Send feedback</h2>
          <p className="mt-2 mb-6 text-sm text-on-surface/60">
            Bug reports and product notes land in our feedback inbox. There is no
            live chat on this page.
          </p>
          <div className="bg-surface-container p-8 rounded-lg border-t-2 border-primary">
            <FeedbackForm />
          </div>
        </section>
      </div>
    </div>
  );
}

export const metadata = {
  title: "Privacy — Blue Beacon Research",
  description: "Blue Beacon Research privacy policy.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface-app px-4 py-16 text-text-primary">
      <div className="mx-auto w-full max-w-3xl rounded-xl border border-border bg-surface p-8">
        <h1 className="text-2xl font-semibold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-text-secondary">Last updated: October 2026</p>
        <p className="mt-3 text-sm text-text-secondary">
          We collect the minimum information required to operate Blue Beacon Research (account identifiers, preferences, and usage
          metrics). We do not sell your personal information.
        </p>
        <div className="mt-6 space-y-3 text-sm text-text-secondary">
          <p>
            Payment details are handled by our payment processor. We store subscription identifiers and plan tier to
            provide access.
          </p>
          <p>
            Analytics may be used to improve product reliability and user experience. You can opt out of non-essential
            analytics where available.
          </p>
          <p>Contact support if you want to request export or deletion of your data.</p>

          <h2 className="pt-4 text-base font-semibold text-text-primary">What we collect</h2>
          <p>
            Blue Beacon Research is an AI-powered research platform. These are the user-linked records the application
            actually writes. Each name is a table in our database.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="text-text-primary">Account.</span> Email-and-password sign-up, or Google sign-in, is
              handled by Supabase Auth. Creating an account inserts a <span className="text-text-primary">profiles</span>{" "}
              row with your name (the name you type, the name Google sends, or the part of your email before @), your
              plan tier, and flags for onboarding and the product tour. If a device registers for mobile alerts, that
              push token is appended on the same row. Signing in can also store a row in{" "}
              <span className="text-text-primary">user_sessions</span>: a session id and a short device label taken from
              the browser user agent (browser and operating system). The access token is not stored in that table.
            </li>
            <li>
              <span className="text-text-primary">Preferences.</span>{" "}
              <span className="text-text-primary">user_preferences</span> stores regions, commodities, forex pairs,
              watchlist symbols, whether those symbols were suggested, minimum severity, time zone, quiet hours, theme,
              email frequency, whether the email digest is on, an optional use case, and when onboarding finished.
            </li>
            <li>
              <span className="text-text-primary">Alerts.</span>{" "}
              <span className="text-text-primary">alert_rules</span> stores the rule name, regions, commodities, forex
              pairs, minimum severity, channels, and frequency. <span className="text-text-primary">alerts_sent</span>{" "}
              records each attempt: channel, status, delivery time, and the reason the rule matched. A Telegram reply
              of useful, not useful, or mute topic is stored in{" "}
              <span className="text-text-primary">alert_feedback</span>.
            </li>
            <li>
              <span className="text-text-primary">Channels you connect.</span>{" "}
              <span className="text-text-primary">user_channels</span> stores a Telegram chat id, a Slack webhook URL,
              and a Discord webhook URL, with the time each was connected. Alert text is sent to a webhook URL only
              after you save it.
            </li>
            <li>
              <span className="text-text-primary">API keys and webhooks.</span>{" "}
              <span className="text-text-primary">api_keys</span> stores a name, a hash of the key, and a short prefix.
              The full key is shown once and is not written to the database.{" "}
              <span className="text-text-primary">webhook_endpoints</span> stores the URL, name, and filters you
              register. <span className="text-text-primary">webhook_deliveries</span> stores the payload, status code,
              and response body of each attempt, linked through that endpoint.
            </li>
            <li>
              <span className="text-text-primary">Chat, feedback, and usage.</span>{" "}
              <span className="text-text-primary">signal_chat_messages</span> stores the text of your questions and the
              replies, for your account and one signal. <span className="text-text-primary">feedback_submissions</span>{" "}
              stores the message you send from Help, an optional email, and the page you were on.{" "}
              <span className="text-text-primary">events</span> stores a product event type and metadata such as a
              signal id, region, or commodity, tied to your account.
            </li>
            <li>
              <span className="text-text-primary">Waitlist.</span> <span className="text-text-primary">waitlist</span>{" "}
              stores the name and email submitted when you join the waitlist, and your account id when you already have
              one.
            </li>
          </ul>

          <h2 className="pt-4 text-base font-semibold text-text-primary">Who processes data</h2>
          <p>These services are referenced in this repository&apos;s dependencies or environment variables.</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="text-text-primary">Supabase</span> stores the database and authentication (
              <span className="text-text-primary">@supabase/supabase-js</span>, <span className="text-text-primary">SUPABASE_URL</span>
              ).
            </li>
            <li>
              <span className="text-text-primary">Vercel</span> hosts the website (<span className="text-text-primary">apps/web/vercel.json</span>
              ). Named product events are sent with <span className="text-text-primary">@vercel/analytics</span>. The
              automatic pageview component is not mounted.
            </li>
            <li>
              <span className="text-text-primary">Railway</span> hosts the API and background workers (the worker
              process reads <span className="text-text-primary">RAILWAY_SERVICE_NAME</span>).
            </li>
            <li>
              <span className="text-text-primary">Upstash</span> provides Redis for rate limits and job queues when{" "}
              <span className="text-text-primary">UPSTASH_REDIS_REST_URL</span> or{" "}
              <span className="text-text-primary">REDIS_URL</span> is set (
              <span className="text-text-primary">@upstash/ratelimit</span>,{" "}
              <span className="text-text-primary">@upstash/redis</span>).
            </li>
            <li>
              <span className="text-text-primary">Resend</span> sends email when{" "}
              <span className="text-text-primary">RESEND_API_KEY</span> is set (<span className="text-text-primary">resend</span>
              ).
            </li>
            <li>
              <span className="text-text-primary">Sentry</span> receives error reports and a sample of traces when{" "}
              <span className="text-text-primary">SENTRY_DSN</span> or{" "}
              <span className="text-text-primary">NEXT_PUBLIC_SENTRY_DSN</span> is set. That initialization does not
              attach your account id or email.
            </li>
            <li>
              <span className="text-text-primary">Anthropic</span> receives the model requests described below when{" "}
              <span className="text-text-primary">ANTHROPIC_API_KEY</span> is set (
              <span className="text-text-primary">@anthropic-ai/sdk</span>).
            </li>
            <li>
              <span className="text-text-primary">PostHog</span> receives page views and named events when{" "}
              <span className="text-text-primary">NEXT_PUBLIC_POSTHOG_KEY</span> is set (
              <span className="text-text-primary">posthog-js</span>). The application does not call PostHog&apos;s
              identify method.
            </li>
            <li>
              <span className="text-text-primary">Voyage AI</span> receives the text of a search query at{" "}
              <span className="text-text-primary">api.voyageai.com</span> when{" "}
              <span className="text-text-primary">VOYAGE_API_KEY</span> is set. The request body is the query text and
              the model name, not an account id. If that key is unset, the query is embedded on our servers and is not
              sent.
            </li>
            <li>
              <span className="text-text-primary">Google</span> handles Google sign-in. The site also loads font files
              from <span className="text-text-primary">fonts.googleapis.com</span> and{" "}
              <span className="text-text-primary">fonts.gstatic.com</span>.
            </li>
            <li>
              <span className="text-text-primary">Telegram</span> receives an alert only after you connect a chat and
              only when a bot token is configured. We store the chat id on <span className="text-text-primary">user_channels</span>.
            </li>
          </ul>

          <h2 className="pt-4 text-base font-semibold text-text-primary">Retention</h2>
          <p>
            A weekly job (Sunday 03:00 UTC) deletes commodity price rows whose fetch time is older than 90 days. It
            deletes raw news rows older than 180 days only when a signal already references them. Raw news that has not
            been turned into a signal is left in place. That job does not delete signals.
          </p>
          <p>
            Session rows last seen more than 30 days earlier are deleted the next time that account signs in. Account,
            preference, alert, chat, and feedback rows are not covered by these jobs.
          </p>

          <h2 className="pt-4 text-base font-semibold text-text-primary">Cookies and analytics</h2>
          <p>
            The cookies this application writes are the Supabase auth session cookies. The server stores the cookies
            the Supabase client asks it to set. Those names match{" "}
            <span className="text-text-primary">sb-&lt;project-ref&gt;-auth-token</span>, including a numbered suffix
            when the value is split into chunks.
          </p>
          <p>
            PostHog runs in the browser only when <span className="text-text-primary">NEXT_PUBLIC_POSTHOG_KEY</span> is
            set, and then it records page views. Named events (sign-up, viewing a signal, creating an alert rule) are
            also sent to PostHog when that key is set, to Vercel Analytics through its{" "}
            <span className="text-text-primary">track</span> call, and, once you are signed in, to the{" "}
            <span className="text-text-primary">events</span> table. This application does not set an analytics cookie
            by name.
          </p>

          <h2 className="pt-4 text-base font-semibold text-text-primary">Data sent to Anthropic</h2>
          <p>
            Model requests do not include your account id, email, or name. If you type those details into a question or
            a search, that text is sent as you wrote it.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Classifying a news event sends the event title, country, event type, and event date. When the feed stored
              a summary, it also sends a cleaned excerpt of that summary (markup removed, cut under 400 characters).
              Items with no usable summary, including GDELT items, are sent without an excerpt. The request also
              includes either the title and age of a recent signal that may be the same story, or a yes/no note that a
              similar story was logged in the last 48 hours, plus a list of public names used to judge whether the
              story is about someone with a documented market reaction.
            </li>
            <li>
              Writing a signal briefing sends the signal title, summary, region, country, severity, and the commodity
              and currency-pair impact fields.
            </li>
            <li>
              Checking whether a chat question is about that signal sends the signal title and the text of your
              message.
            </li>
            <li>
              Answering a chat question sends the signal title, summary, briefing, region, country, severity,
              confidence, commodity and currency-pair impacts, source count, event date, and source URLs, plus up to 10
              earlier turns (role and text only) and your new message. The account id used to load those turns is not
              included in the request.
            </li>
            <li>
              Search assist sends your query text and one retrieved page&apos;s title, URL, and text.
            </li>
          </ul>

          <h2 className="pt-4 text-base font-semibold text-text-primary">Your rights</h2>
          <p>
            To request an export or deletion of your data, email{" "}
            <a className="text-text-primary underline" href="mailto:support@bluebeaconresearch.com">
              support@bluebeaconresearch.com
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

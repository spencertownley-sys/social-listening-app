import type { Metadata } from "next";
import { A, LegalPage, List, Placeholder, Section, Table } from "@/components/Legal";

export const metadata: Metadata = { title: "Cookie policy | Earshot" };

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie policy for Earshot" updated="14 November 2026">
      <p>
        Earshot only uses the cookies and browser storage it needs to work. It does not use analytics, advertising or cross-site tracking
        cookies, so there is nothing to opt in to. This page lists exactly what is stored and what loads from other companies.
      </p>

      <Section title="Cookies">
        <Table
          head={["Name", "Set by", "Purpose", "Type", "How long"]}
          rows={[
            [
              <code key="n">earshot_session</code>,
              "Earshot",
              "Keeps you signed in. It holds your user id, a session version and an expiry, signed so it cannot be forged.",
              "Strictly necessary",
              "30 days, or until you sign out",
            ],
          ]}
        />
      </Section>

      <Section title="Browser storage">
        <Table
          head={["Key", "Where", "Purpose", "Type", "How long"]}
          rows={[[<code key="k">cookie-consent</code>, "localStorage", "Remembers that you have seen the cookie notice", "Strictly necessary", "180 days"]]}
        />
      </Section>

      <Section title="Other companies your browser contacts">
        <Table
          head={["Company", "Host", "Why", "When", "What they receive"]}
          rows={[
            [
              "The social network or feed that published a post",
              "The media host of that network (varies by post)",
              "Shows the post's thumbnail image in a feed",
              "When a signed-in user views a feed that contains posts with media",
              "IP address, browser details",
            ],
          ]}
        />
      </Section>

      <Section title="Your choices">
        <List
          items={[
            "You can clear or block cookies and site storage in your browser settings. The items above are needed for the site to work: without the session cookie you can't stay signed in.",
          ]}
        />
      </Section>

      <Section title="Contact">
        <p>
          Questions about this page: <Placeholder>contact email for privacy requests</Placeholder>. See also the{" "}
          <A href="/privacy">privacy policy</A>.
        </p>
      </Section>
    </LegalPage>
  );
}

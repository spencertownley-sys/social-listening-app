import type { Metadata } from "next";
import { A, LegalPage, List, Placeholder, Section, Table } from "@/components/Legal";

export const metadata: Metadata = { title: "Privacy policy | Earshot" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy for Earshot" updated="14 November 2026">
      <Section title="Who is responsible">
        <p>
          Earshot (https://earshot-listening.up.railway.app) is a private social listening tool run by <Placeholder>owner legal name</Placeholder>,{" "}
          <Placeholder>city, state, country</Placeholder>. Contact: <Placeholder>contact email for privacy requests</Placeholder>.
        </p>
        <p>
          Earshot collects public posts that mention the topics a team asks it to listen for, labels them, and sends that team digests
          and alerts. This policy covers two groups of people: members of a team that uses Earshot, and the authors of the public
          posts it collects.
        </p>
      </Section>

      <Section title="What is collected and why">
        <List
          items={[
            <>
              <strong>Team members:</strong> name, email address and a password hash (never the password itself), plus workspace role
              and invite records. Used to sign you in and to decide what you can see and change.
            </>,
            <>
              <strong>Public posts from social networks and feeds:</strong> the author&apos;s handle and display name, the post text,
              links and media. Only public content is collected: Earshot does not read private messages, private accounts or anything
              behind a login.
            </>,
            <>
              <strong>AI labels for each post:</strong> sentiment, emotions and intent (for example a complaint or churn risk),
              produced by Anthropic&apos;s Claude, plus short AI-written digest summaries. The labels describe what a post says so a
              team can sort its feed. They are not used to make decisions about the people who wrote them.
            </>,
            <>
              <strong>Listening settings:</strong> each listening profile&apos;s lists of muted authors, the feedback a team gives on
              posts, and a top-authors view.
            </>,
            <>
              <strong>Exports and backups:</strong> owners can export their workspace, and the server keeps nightly backups of
              everything above, including password hashes. A copy emailed with the backup notice is encrypted and has the password
              hashes removed.
            </>,
            <>
              <strong>Technical data:</strong> like every website, the hosting provider receives your IP address and browser details
              in order to deliver pages and keep the service secure. Sign-in attempts are counted per IP address and email for 15
              minutes to block password guessing; those counters are kept in memory only.
            </>,
          ]}
        />
        <p>
          Legal bases under EU and UK law: for team members, providing the service you signed up for (contract) and keeping it secure
          (legitimate interests). For post authors, the legitimate interest of the team using Earshot in understanding public
          conversation about its brand, products or topics. You can object at any time (see Your rights).
        </p>
      </Section>

      <Section title="Who it is shared with">
        <Table
          head={["Company", "What they do for Earshot", "Where"]}
          rows={[
            ["Railway", "Hosting, the Postgres database and backup files on disk", "United States"],
            ["Anthropic", "Labels post text with sentiment, emotion and intent, and writes digest summaries", "United States"],
            ["Resend", "Sends digest emails, alerts and the nightly backup notice (with an encrypted copy, when the owner turns that on)", "United States"],
            ["Slack, Discord or a custom webhook (only when a team configures one)", "Receives alert messages that include post text", "United States"],
          ]}
        />
        <p>Your browser also contacts these companies directly when you use the site:</p>
        <Table
          head={["Company", "Why", "When"]}
          rows={[["The social network or feed that published a post", "Shows the post's thumbnail image in a feed", "When a signed-in user views a feed that contains posts with media"]]}
        />
        <p>Personal information is not sold, and it is not shared for cross-context behavioural advertising.</p>
      </Section>

      <Section title="International transfers">
        <p>
          The companies above are mostly based in the United States. Where data leaves the EU or UK it is covered by the
          provider&apos;s standard contractual clauses or Data Privacy Framework certification.
        </p>
      </Section>

      <Section title="How long it is kept">
        <List
          items={[
            "Collected posts and their AI labels and matches: 90 days from when the post was published, then deleted automatically.",
            "Posts their author deletes: Bluesky posts are removed within a few minutes of the deletion, from Bluesky's real-time stream. Other networks don't send Earshot deletion signals, so their posts are removed at the 90-day limit or sooner on request.",
            "Team member accounts: until you delete your account (Account page, Delete my account) or an owner removes you.",
            "Invite links: they work for 7 days and are deleted 30 days after they expire.",
            "In-app notifications: the latest 500 are kept. Run logs: the latest 50.",
            "Nightly backups on the server: the latest 7 (about a week). Backup notices and encrypted copies sent by email stay in the recipients' mailboxes until they delete them.",
            <>
              Server logs at the hosting provider: <Placeholder>how long Railway keeps request logs for this service</Placeholder>.
            </>,
          ]}
        />
      </Section>

      <Section title="Your rights">
        <List
          items={[
            "EU and UK: access, correction, deletion, restriction, objection, portability, withdrawing consent, and the right to complain to your data protection authority.",
            "California and other US state residents: the right to know, delete and correct, and to opt out of sale or sharing. Earshot does not sell or share personal information, and it honours Global Privacy Control signals.",
            "Team members can delete their own account at any time from the Account page.",
            <>
              Post authors can ask for everything Earshot holds about their handle to be erased. The owner removes every stored post by
              that handle, the AI labels and alert lines that quote it, and the handle from muted lists. New public posts can be
              collected again if they match a listening profile.
            </>,
            <>
              To use any of these rights, email <Placeholder>contact email for privacy requests</Placeholder>. You will get an answer
              within 30 days. You will never be treated differently for using them.
            </>,
          ]}
        />
      </Section>

      <Section title="Children">
        <p>Earshot is not directed at children under 13 (under 16 in the EU and UK) and does not knowingly collect their data.</p>
      </Section>

      <Section id="cookies" title="Cookies and storage">
        <p>
          Earshot sets one cookie, <code>earshot_session</code>, which keeps you signed in, and stores a <code>cookie-consent</code>{" "}
          entry in your browser to remember that you have seen the cookie notice. Both are strictly necessary. There are no analytics or
          advertising cookies. See the <A href="/cookies">cookie policy</A> for the details.
        </p>
      </Section>

      <Section title="Changes">
        <p>If this policy changes in a way that matters, the date above changes and a notice is shown on the site.</p>
      </Section>
    </LegalPage>
  );
}

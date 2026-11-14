import type { Metadata } from "next";
import { A, LegalPage, List, Placeholder, Section } from "@/components/Legal";

export const metadata: Metadata = { title: "Terms of use | Earshot" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use for Earshot"
      updated="14 November 2026"
      draft={
        <>
          Draft for the owner to review before anyone outside the owner&apos;s own team is invited. This is not legal advice.{" "}
          <Placeholder>owner to review and approve these terms</Placeholder>
        </>
      }
    >
      <Section title="1. Who provides Earshot">
        <p>
          Earshot (https://earshot-listening.up.railway.app) is provided by <Placeholder>owner legal name</Placeholder>,{" "}
          <Placeholder>city, state, country</Placeholder>. Contact: <Placeholder>contact email</Placeholder>. By creating an account or
          using Earshot you agree to these terms.
        </p>
      </Section>

      <Section title="2. The service">
        <p>
          Earshot collects public posts from social networks and feeds that match the listening profiles your team sets up, labels them
          with AI, and sends your team feeds, digests and alerts. It is provided as is and as available, without warranties of any kind,
          to the extent the law allows. AI labels and summaries can be wrong: check the original post before acting on one.
        </p>
      </Section>

      <Section title="3. Accounts">
        <List
          items={[
            "Accounts are by invitation. One person per account: don't share your sign-in.",
            "Keep your password safe and tell a workspace owner straight away if you think someone else has used your account.",
            "You must be at least 13 years old (16 in the EU and UK) to have an account.",
            "Owners decide who is in their workspace and what role each person has.",
          ]}
        />
      </Section>

      <Section title="4. Acceptable use">
        <p>You must not use Earshot:</p>
        <List
          items={[
            <>
              <strong>to harass, stalk, track or surveil individuals</strong>, or to build profiles of private people. Earshot is for
              understanding public conversation about brands, products and topics.
            </>,
            "to break the law, or to break the terms of the networks whose public posts Earshot collects.",
            "to make decisions about individuals, such as employment, credit, housing or insurance, based on their posts or Earshot's AI labels.",
            "to scrape, overload, probe or try to break or get around the security of the service, or to access data that isn't yours.",
            "to send abusive, unlawful or misleading content through its alerts or integrations.",
          ]}
        />
      </Section>

      <Section title="5. Content">
        <List
          items={[
            "What you put into Earshot (listening profiles, feedback, notes) stays yours. You give the provider only the permission needed to store and process it to run the service for your team.",
            "Posts that Earshot collects belong to their authors and are governed by the terms of the network they came from. Use them only for your team's listening, not to republish them as your own.",
            <>
              Authors can ask for their data to be erased; see the <A href="/privacy">privacy policy</A>.
            </>,
          ]}
        />
      </Section>

      <Section title="6. Price">
        <p>Earshot doesn&apos;t charge for its use today and doesn&apos;t collect payment details.</p>
      </Section>

      <Section title="7. Ending an account">
        <List
          items={[
            "You can delete your account at any time from the Account page (the last owner of a workspace must make someone else an owner first).",
            "A workspace owner can remove you from their workspace.",
            "The provider may suspend or close an account that breaks these terms, or to protect the service, other users or the people whose posts it collects.",
          ]}
        />
      </Section>

      <Section title="8. Liability and governing law">
        <p>
          To the extent the law allows, the provider is not liable for indirect or consequential losses, or for decisions made using
          Earshot&apos;s data or AI labels. Nothing in these terms limits liability that can&apos;t be limited by law. These terms are
          governed by the law of <Placeholder>state and country whose law governs these terms</Placeholder>.
        </p>
      </Section>

      <Section title="9. Changes">
        <p>
          If these terms change in a way that matters, the date above changes and a notice is shown in Earshot before the new terms
          apply. Continuing to use Earshot after that means you accept them.
        </p>
      </Section>
    </LegalPage>
  );
}

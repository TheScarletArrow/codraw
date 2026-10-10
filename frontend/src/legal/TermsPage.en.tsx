import { Link } from 'react-router'
import type { LegalInfo } from '../api/legal.ts'
import { Operator } from './LegalPage.tsx'

/** The terms of use in English: a translation of the Russian ones, which prevail. */
export function TermsEn({ legal }: { legal: LegalInfo }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        This is a translation for convenience; the Russian version prevails.
      </p>

      <section aria-labelledby="terms-service">
        <h2 id="terms-service">The service</h2>
        <p className="mt-2">
          CoDraw is a diagram editor in which several people work on one board at the same time. By signing in with
          GitHub or Google or by continuing without signing in, you accept these terms and the{' '}
          <Link to="/privacy" className="underline">
            privacy policy
          </Link>
          .
        </p>
        <div className="mt-2">
          <Operator legal={legal} />
        </div>
      </section>

      <section aria-labelledby="terms-account">
        <h2 id="terms-account">Account</h2>
        <p className="mt-2">
          You are responsible for access to your GitHub or Google account. A guest works in their own browser: if they
          clear the cookies without signing in, their boards become unavailable to them; by signing in, a guest moves
          their boards and comments to the account.
        </p>
      </section>

      <section aria-labelledby="terms-content">
        <h2 id="terms-content">Content of boards</h2>
        <p className="mt-2">
          The content of boards belongs to their authors. The operator stores and shows it only to make the service
          work. Access to a board by link is given to anyone who has the link, in “View” or “Edit” mode, as the owner
          chooses; the “Anyone with the link, without signing in” mode opens the board for viewing even without signing
          in, including on other websites where it is embedded, and the “Only me” mode closes the board. Edits and
          comments of the members of a board are seen by all its members, and members in “View” mode can comment too.
          The owner can restore the board to an earlier version and delete any comment on it. The “Live image” of a
          page, which the owner turns on, is open to anyone who has its link, regardless of access to the board.
        </p>
      </section>

      <section aria-labelledby="terms-rules">
        <h2 id="terms-rules">What you must not do</h2>
        <ul>
          <li>post unlawful content and data of other people without the right to do so;</li>
          <li>upload malicious code or try to gain access to other people’s boards and accounts;</li>
          <li>circumvent the limits of the service or create load that interferes with other users.</li>
        </ul>
        <p className="mt-2">The operator may delete content and accounts that violate these terms.</p>
      </section>

      <section aria-labelledby="terms-limits">
        <h2 id="terms-limits">Limits and warranties</h2>
        <p className="mt-2">
          The service has limits: the number of boards of a user, the size of a board, the number of comments on a
          board, the number of new guests from one address. The service is provided “as is”: the operator tries to keep
          it running without interruptions and to preserve data, but does not promise this. Keep copies of important
          diagrams: they can be exported to <code>.drawio</code>, PNG or SVG. The liability of the operator is limited
          to the extent permitted by law.
        </p>
      </section>

      <section aria-labelledby="terms-changes">
        <h2 id="terms-changes">Changes to the terms</h2>
        <p className="mt-2">
          The terms may change; the date at the top shows when they changed. By continuing to use the service after a
          change, you accept the new terms. Questions about the terms go to the operator of the service.
        </p>
      </section>
    </>
  )
}

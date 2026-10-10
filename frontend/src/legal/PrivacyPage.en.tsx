import type { LegalInfo } from '../api/legal.ts'
import { pluralEn } from '../i18n/i18n.ts'
import { LOCAL_COPY_LIMIT } from '../offline/localCopies.ts'
import { days, Operator } from './LegalPage.tsx'

/** The privacy policy in English: a translation of the Russian one, which prevails. */
export function PrivacyEn({ legal }: { legal: LegalInfo }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        This is a translation for convenience; the Russian version prevails.
      </p>

      <section aria-labelledby="privacy-operator">
        <h2 id="privacy-operator">Who processes the data</h2>
        <p className="mt-2">
          CoDraw is a diagram editor for working together. This installation of CoDraw runs on the servers of its
          operator, and the operator processes the data of its users.
        </p>
        <div className="mt-2">
          <Operator legal={legal} />
        </div>
      </section>

      <section aria-labelledby="privacy-data">
        <h2 id="privacy-data">What data we process</h2>
        <ul>
          <li>
            <strong>Account.</strong> When you sign in with GitHub or Google: the name, the address of the profile
            picture and the identifier of the user at that service. CoDraw does not ask for an email address and does
            not receive the password of GitHub or Google. The account also stores the language of the interface — the
            one chosen in the “Language” menu or, if you have not chosen one, the language of the browser at sign-in — so
            that emails and messages of notifications arrive in it.
          </li>
          <li>
            <strong>Guest account.</strong> When you work without signing in: a name such as “Guest 12”, without
            personal data.
          </li>
          <li>
            <strong>Boards.</strong> The titles of boards, their pages, shapes, connectors and labels, the name of the
            member who locked an element of a board, the name and identifier of the member who last changed an element
            and the time of that change, the name and identifier of the member who wrote the text of a sticky note, the
            status of an element (“Draft”, “Needs review”, “Done”) with the name and identifier of the member who set it
            and the time, saved versions of boards with their names and which members changed the board between
            versions, and also which boards of other users the user opened by link. For searching boards, the text of a
            board is stored next to the document of the board: the names of the pages and the labels of shapes,
            connectors and tables.
          </li>
          <li>
            <strong>Tags and folders.</strong> The tags the user gave to their own and shared boards in their list, their
            folders and which folder each board is in.
          </li>
          <li>
            <strong>Shape libraries.</strong> The personal libraries of the user: their names and components — shapes,
            connectors and labels the user saved from boards, with the images inside them, their own pictures and SVG
            files and their small previews.
          </li>
          <li>
            <strong>Personal templates.</strong> The name, description, dates and a saved copy of the diagram with
            images. Templates are visible only to their owner, are kept until the owner deletes them or their account is
            deleted, and are kept independently of the original board. Guest templates move to the account on sign-in.
          </li>
          <li>
            <strong>Images.</strong> Pictures that members put on boards — by pasting, dragging, the “Image” button or
            from a <code>.drawio</code> file — with their format and size, in the file storage of the server; the board
            holds a link to the picture. Who uploaded a picture is not stored.
          </li>
          <li>
            <strong>Board visits.</strong> When the user was last on each board they have access to, so that on their
            return they can be shown who changed the board since their last visit and what changed.
          </li>
          <li>
            <strong>Board membership.</strong> Which boards of other users the user is a member of and with what role —
            “Edit” or “View” — by invitation or by decision of the owner of the board.
          </li>
          <li>
            <strong>Team workspaces.</strong> The names of workspaces and their projects, who is a member of which
            workspace and with what role — “Owner”, “Admin”, “Editor” or “Viewer” — since when, invitation links with
            their roles, which boards belong to a workspace and are in which project, and who is responsible for them.
            Members of a workspace see each other: name and profile picture. Removing a member removes their membership
            and personal roles on the boards of the workspace; deleting a workspace removes its projects, members and
            invitations, and its boards go to the trash of the one who deleted it.
          </li>
          <li>
            <strong>Access requests.</strong> Which role the user requested from the owner of another user’s board,
            their message to the owner and the time of the request.
          </li>
          <li>
            <strong>Comments.</strong> The text of comments on boards, their author and time, who marked a thread
            resolved, which members of the board a comment mentions, who reacted to a comment with which reaction and
            who is assigned to a thread.
          </li>
          <li>
            <strong>Architecture decisions.</strong> The number, title, status and text of the decisions of a board, the
            day of the decision, who recorded it, the time of changes and the elements of the diagram it is linked to;
            the discussion of a decision is comment threads, as above.
          </li>
          <li>
            <strong>Change proposals.</strong> The author of a proposal, its title and description, the draft of the
            board with the author’s edits and the board as of the proposal, the time, who accepted, declined or withdrew
            the proposal, and the comment on a declined one.
          </li>
          <li>
            <strong>Notifications.</strong> Who did what that concerns the user: mentioned them or replied in their
            comment thread, assigned a thread to them, requested access to their board, answered their access request,
            transferred a board to them, proposed changes to their board or decided on their proposal, requested a
            review of an element of their board — with the board, comment, thread, proposal or page and element, the
            time and a read mark. The text of the comment, the title of the proposal and the title of the board are not
            stored in the notification but are taken from the comment, proposal and board themselves.
          </li>
          <li>
            <strong>Notifications outside CoDraw.</strong> If you have set them up: the email address and a mark that you
            confirmed it with the link from the email, the address of the incoming webhook of your chat, which events to
            send there, the boards not to send about, and the queue of emails and messages with whether they were sent,
            when, and why not.
          </li>
          <li>
            <strong>Copies of boards in the browser.</strong> The content of the boards you open, edits not yet sent to
            the server, and the list of these copies with the titles of the boards — in the storage of your browser (see
            below).
          </li>
          <li>
            <strong>Presence.</strong> The name, color, cursor position, selection and view of the canvas of a member,
            and also which element’s label they are editing, whom they are following, whether they are presenting the
            board to everyone, the trail of their laser pointer and the messages they write at the cursor are seen by
            the other members of the same board while they are on it; this is not saved.
          </li>
          <li>
            <strong>Technical data.</strong> Cookies (see below), the network address and the browser — in the request
            logs of the server, and the address also for a short time in the memory of the server, to limit the number
            of new guests and error reports from one address.
          </li>
          <li>
            <strong>Error reports.</strong> If an error of CoDraw happens in the browser, the server receives its text,
            the place in the code, the address of the page without parameters and information about the browser. Error
            reports contain no content of boards.
          </li>
          {legal.issues && (
            <li>
              <strong>GitHub issues.</strong> If you have connected GitHub: your access token and the name of the GitHub
              account it belongs to, and a mark that GitHub stopped accepting the token; the token is stored on the
              server and is not shown to anyone, including you. GitHub issues that members linked to elements and
              comment threads of boards — with the repository, number, title, status, link, whether the repository is
              private, who linked the issue and when, and when CoDraw last asked GitHub about it.
            </li>
          )}
          {legal.schemaImport && (
            <li>
              <strong>Database connection.</strong> To load the schema of a PostgreSQL database into “Import SQL”, you
              enter the address and port of its server, the name of the database, the user and the password. The CoDraw
              server connects to that database with them once, only to read its schema, and does not save them; the
              server log gets the address and port of the database server and the result, without the name of the
              database, the user and the password.
            </li>
          )}
        </ul>
      </section>

      <section aria-labelledby="privacy-purposes">
        <h2 id="privacy-purposes">Why</h2>
        <p className="mt-2">
          So that you can sign in, create boards and work on them together with others; to protect the service from
          abuse and overload; to find and fix errors. We do not use the data for advertising and do not build profiles
          of users.
        </p>
      </section>

      <section aria-labelledby="privacy-cookies">
        <h2 id="privacy-cookies">Cookies</h2>
        <p className="mt-2">CoDraw sets only the cookies without which the service does not work:</p>
        <ul>
          <li>
            <code>SESSION</code> — the session: remembers that you are signed in. For a guest it is kept for{' '}
            {days(legal.guestSessionDays)} after the last request.
          </li>
          <li>
            <code>XSRF-TOKEN</code> — protection against forged requests from other websites.
          </li>
        </ul>
        <p className="mt-2">
          There is no analytics, advertising or third-party tracking in CoDraw, so no consent to cookies is asked for.
        </p>
      </section>

      <section aria-labelledby="privacy-local-copies">
        <h2 id="privacy-local-copies">Copies of boards in the browser</h2>
        <p className="mt-2">
          So that a board opened before is shown at once and edits made offline are not lost, the browser keeps a copy
          of each board you open: its content and the edits not yet sent to the server (IndexedDB), and the list of
          copies with the titles of the boards (<code>localStorage</code>). The copies are only on your device and only
          for you: another user of this browser does not see them. Only the edits of a board go from a copy to the
          server, as in normal work.
        </p>
        <p className="mt-2">
          The browser keeps copies of no more than the last {LOCAL_COPY_LIMIT}{' '}
          {pluralEn(LOCAL_COPY_LIMIT, 'board', 'boards')} you opened. Signing out of CoDraw deletes your copies, and
          another user signing in in this browser deletes the copies of the previous one. The copy of a deleted board
          and of a board you no longer have access to is deleted when you open it; the unsent edits in it can first be
          downloaded as <code>.drawio</code>. All copies can also be deleted at once in the browser settings, by
          clearing the data of this site.
        </p>
        <p className="mt-2">
          The browser also remembers the number of the latest version of CoDraw whose novelties the “What’s new” window
          told you about, to show it once after an update, and the chosen order of the list of boards (
          <code>localStorage</code>), as well as the color you last chose for sticky notes (<code>localStorage</code>),
          so that new sticky notes have that color, and whether the minimap of the canvas is collapsed (
          <code>localStorage</code>, key <code>codraw.minimap</code>), to show it the same way on other boards and after
          a reload.
        </p>
        <p className="mt-2">
          The browser also remembers the theme chosen in the “Theme” menu — “Light” or “Dark” — (<code>localStorage</code>
          ), so that CoDraw opens in it at once; for “As in the system” nothing is stored. The theme does not go to the
          server, and other members of boards do not see it.
        </p>
        <p className="mt-2">
          The browser also remembers the language of the interface chosen in the “Language” menu (
          <code>localStorage</code>, key <code>codraw.locale</code>), so that CoDraw opens in it at once; until a
          language is chosen, CoDraw follows the language of the browser.
        </p>
      </section>

      <section aria-labelledby="privacy-retention">
        <h2 id="privacy-retention">How long the data is kept</h2>
        <ul>
          <li>The account and boards — until you delete the boards or ask to delete the account.</li>
          <li>
            A guest who has not returned for {days(legal.guestSessionDays)} can no longer return; their boards are
            deleted when no one has worked with them for {days(legal.guestBoardRetentionDays)}, and then the guest
            itself is deleted.
          </li>
          <li>
            Each board keeps no more than the last {legal.versionsPerBoard}{' '}
            {pluralEn(legal.versionsPerBoard, 'version', 'versions')}; named versions are deleted last.
          </li>
          <li>The live image of a page — until the owner turns it off, and no longer than the board.</li>
          <li>
            Images of a board — as long as the board exists, even if they are no longer on the board: versions, change
            proposals and undoing edits show them again. Deleting a board moves it together with its images to the trash
            for 30 days. The owner can restore it or delete it permanently; when the period ends, the data is deleted.
          </li>
          <li>
            Board membership — until the owner removes the member, and no longer than the board and the account of the
            member.
          </li>
          <li>The text of a board for search — as long as its document exists; every save of the board updates it.</li>
          <li>
            The time of visits to a board — as long as the user has access to it, and no longer than the board and the
            account.
          </li>
          <li>
            Tags and folders — until the user removes them; the tags and folder of a shared board — as long as the user
            has access to it; no longer than the board and the account.
          </li>
          <li>
            Shape libraries with components — until the user deletes them, and no longer than the account. Copies of
            components on boards are part of the boards and are kept like boards.
          </li>
          <li>
            An access request — until the owner answers it or the user cancels it, and no longer than the board and the
            account.
          </li>
          <li>
            Comments — until the author or the owner of the board deletes them, and no longer than the board itself.
            Comments of a deleted user stay on the board without the name of the author. A reaction — until it is
            removed, and no longer than the comment; an assignee — until the thread is reassigned or the assignee is
            removed, and no longer than the thread. Reactions of a deleted user are deleted, and threads assigned to
            them are left without an assignee.
          </li>
          <li>
            Decisions — until the owner or editors of the board delete them, and no longer than the board itself;
            deleting a decision deletes its discussion. Decisions of a deleted user stay on the board without the name
            of the author.
          </li>
          <li>
            Change proposals: an open one — until it is accepted or declined or the author withdraws it, and of the
            closed ones a board keeps the last {legal.closedProposalsPerBoard}; no longer than the board and the account
            of the author.
          </li>
          <li>
            Notifications — no longer than {days(legal.notificationRetentionDays)} and no more than the last{' '}
            {legal.notificationsPerUser} of a user, read or not; a notification is deleted together with the board,
            comment, thread, proposal and account it is about.
          </li>
          <li>
            Copies of boards in the browser — until signing out of CoDraw or another user signing in in this browser, no
            more than the last {LOCAL_COPY_LIMIT} opened {pluralEn(LOCAL_COPY_LIMIT, 'board', 'boards')}.
          </li>
          <li>
            The email address, the webhook and the boards without notifications — until you delete them, and no longer
            than the account; an email or a message in the queue — no longer than the notification it is about.
          </li>
          {legal.issues && (
            <li>
              The GitHub token — until you disconnect GitHub or replace the token, and no longer than the account; a
              linked issue — until it is unlinked, no longer than the board, and one linked to a thread no longer than
              the thread.
            </li>
          )}
          {legal.schemaImport && (
            <li>Database credentials — only for the time of one connection to it; they are not stored.</li>
          )}
          <li>Server logs — as long as the operator keeps them.</li>
        </ul>
      </section>

      <section aria-labelledby="privacy-recipients">
        <h2 id="privacy-recipients">Who receives the data</h2>
        <p className="mt-2">
          GitHub and Google learn about sign-ins through them under their own rules.{' '}
          {legal.schemaImport &&
            'The address, the name of the database, the user and the password you enter to load the schema of a database are passed by the CoDraw server only to that database. '}
          The members of a board see its content with images — the server gives the images of a board only to those
          who have access to the board — comments with the names of their authors, reactions with the names of those
          who reacted, the assignees of threads, architecture decisions with the names of those who recorded them, each
          other’s presence and the list of members of the board with their roles; the owner also sees those who opened
          the board by link, and access requests with the name, avatar and message of the one who asks. Which members
          changed the board between versions is seen by those who have access to the version history — the owner and
          editors — and who changed it since a member’s last visit is seen by the returning member themselves,
          including one with the “View” role; the time of visits, tags, folders and shape libraries are seen by no one
          but the user themselves — neither the owner nor other members of a shared board. A change proposal with its
          draft is seen by its author and the owner and editors of the board. The owner of the board, its members and
          those who opened it by link can be mentioned in a comment. A notification is seen only by the one it is
          addressed to; about a board they no longer have access to, it shows neither the title, nor the text, nor the
          author. If the owner has turned on the “Live image” of a page, anyone who has the link to the image sees it,
          even when access to the board is closed; turning it off deletes the image. If the owner has chosen the link
          access “Anyone with the link, without signing in”, the board — its pages with labels, images, statuses of
          elements and who changed the elements — is seen by anyone who has the link, without signing in, including on
          other websites where it is embedded; they do not see comments, members and presence. If you have set up
          notifications outside CoDraw, the text of a notification — who did what, the title of the board, the
          beginning of the comment and a link — goes to the mail server of this installation for your address and to
          the chat service whose webhook address you entered; CoDraw does not show the webhook address to anyone,
          including you, after it is saved.{' '}
          {legal.issues &&
            'If you have connected GitHub, the CoDraw server calls GitHub with your token when you search for, link or create an issue, and to update the status of the issues you linked; a created issue gets its title, description and a link to the element or thread with the title of the board and the label of the element. The number, title and status of a linked issue, including one from a private repository, and the name of the one who linked it are seen by everyone who has access to the board. '}
          The data is not passed or sold to anyone else.
        </p>
      </section>

      <section aria-labelledby="privacy-rights">
        <h2 id="privacy-rights">Your rights</h2>
        <p className="mt-2">
          You can find out what data about you is stored, correct it, get a copy of it or demand its deletion, and also
          withdraw your consent to processing, by writing to the operator. You delete your boards yourself, and the
          content of any board can be exported to <code>.drawio</code>. Copies of boards in the browser are deleted by
          signing out of CoDraw or by clearing the site data in the browser.
        </p>
      </section>

      <section aria-labelledby="privacy-changes">
        <h2 id="privacy-changes">Changes to the policy</h2>
        <p className="mt-2">
          If CoDraw starts processing data differently, this page will change, and the date at the top will show when.
        </p>
      </section>
    </>
  )
}

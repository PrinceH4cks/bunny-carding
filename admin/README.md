# Store Admin

The owner's panel. Deployed as its own site, separate from the customer store.

A static site: plain HTML, CSS and ES modules. There is no build step, no
bundler and no server-side code, so what is in the repository is what runs.

## Running it

Any static file server works, from the repository root:

    npx serve .
    python -m http.server

Open the page you need directly, for example `/index.html`.

## Layout

    index.html          the page the domain opens on
    pages/              every other page
    css/style.css       the one stylesheet
    assets/images/      images, when the site needs any
    assets/icons/       icon files, when they are not inline
    assets/fonts/       webfonts, when the design stops using the system stack
    js/core/            the Firebase connection, auth, app-wide helpers
    js/components/      reusable pieces of the interface
    js/services/        one file per part of the business
    js/pages/           one file per page
    config/             Firestore and Storage rules, and the indexes

The split by layer is the point: a page under `js/pages/` only wires up its own
screen, the pieces it renders with live in `js/components/`, and everything that
touches Firestore lives in `js/services/`. Nothing in `js/core/` knows which page
is open.

Pages:

    (root)
        index.html
    pages
        content.html
        coupons.html
        dashboard.html
        messages.html
        orders.html
        payments-autopay.html
        payments-crypto.html
        payments-manual.html
        payments-settings.html
        payments.html
        products.html
        reports.html
        setup.html
        users.html

## Firebase

Set the values in `js/core/firebase-config.js`:

- `firebaseConfig` — the project's web app config
- `OWNER_UID` (admin only) — the account allowed into the panel
- `SITE_URL` (admin only) — where the customer store is published, so links out
  to it resolve
- `SITE_ADMIN_URL` (store only) — where the panel is published

`config/` holds the rules and indexes. Publish them with the Firebase CLI;
they are not applied by hosting alone.

Security note: the ZapUPI key lives in Firestore, not in this repository. Enter
it on the payments settings page. Never commit it.

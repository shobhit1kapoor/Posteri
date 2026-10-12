# Poster product experience

## Goal

Bring the POSTERI poster detail page closer to the interaction model observed on the requested H&M product page, while keeping the POSTERI visual identity and clearly distinguishing demo review/authentication behavior from real customer data.

## Steps

1. Implement the product detail experience in `src/main.jsx`.
   - Add product image and wall-mockup presentation, review drawer, product-information accordions, and poster recommendation sections.
   - Add wishlist state shared by product cards, product detail, and a saved-posters view.
   - Gate wishlist actions behind the existing sign-in UI; the prototype will not claim to authenticate against a backend.
   - Test: inspect all affected render paths and ensure interactions use existing product data and poster assets.
2. Add responsive presentation and drawer states in `src/catalog.css`.
   - Keep the filter drawer behavior unchanged; add product review sheet, product gallery, recommendation rail, and wishlist view styles.
   - Test: desktop and mobile widths in the local app.
3. Verify the implementation.
   - Run `npm run build`.
   - Exercise product navigation, review open/close, accordions, recommendations, wishlist sign-in prompt, save/unsave, and empty/saved wishlist states in the running app.

## Reference interaction notes

- The H&M product page presents product imagery beside the detail panel.
- Reviews open in a right-side overlay sheet over a dimmed page.
- Description/fit, material/care, and delivery/payment are independent disclosure sections.
- “Style with” and “Similar items” are separate recommendation carousels below the product details.

## Scope and safeguards

- Do not reproduce H&M branding or product assets.
- Show any local example review copy as sample preview content, not verified customer submissions.
- Demo sign-in stores only a local preview flag and poster IDs; no credentials are sent or stored.
- Preserve the existing catalog, generated posters, mockups, and running dev-server setup.

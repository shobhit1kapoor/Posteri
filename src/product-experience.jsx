import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Heart,
  Minus,
  Plus,
  Star,
  X,
} from 'lucide-react';
import { createClient as createSupabaseClient, hasSupabaseConfig } from '../lib/supabase/client';
import { PosterMockup } from './poster-artwork.jsx';

const posterSrc = (p) => p.image || `/posters/${p.id}.png`;

const SAMPLE_REVIEWS = [
  { rating: 5, title: 'A lovely finishing touch', body: 'The colours feel even better in person. It looks right at home above my desk.', date: 'Sample entry' },
  { rating: 5, title: 'Just the right amount of nostalgia', body: 'Great paper feel and a clean print. I’m already planning a little gallery wall.', date: 'Sample entry' },
  { rating: 4, title: 'Simple, well made print', body: 'The artwork is crisp and the matte finish keeps it feeling understated.', date: 'Sample entry' },
  { rating: 5, title: 'Made my wall feel like mine', body: 'Picked this up for a small corner in my room and it pulls the whole space together.', date: 'Sample entry' },
];

export function WishlistButton({ p, saved = false, onToggle, className = '' }) {
  return (
    <button
      type="button"
      className={`wish ${saved ? 'saved' : ''} ${className}`.trim()}
      aria-label={`${saved ? 'Remove' : 'Save'} ${p.name} ${saved ? 'from' : 'to'} wishlist`}
      aria-pressed={saved}
      title={saved ? 'Remove from wishlist' : 'Save to wishlist'}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(p);
      }}
    >
      <Heart fill={saved ? 'currentColor' : 'none'} />
    </button>
  );
}

function ProductPosterCard({ p, select, wishlist, onWishlist }) {
  return (
    <article className="pdp-product-card">
      <div className="pdp-card-image-wrap">
        <button className="poster has-mockup pdp-card-image" onClick={() => select(p)} aria-label={`View ${p.name}`}>
          <img className="poster-art" src={posterSrc(p)} alt="" loading="lazy" />
          <PosterMockup product={p} />
        </button>
        <WishlistButton p={p} saved={wishlist.includes(p.id)} onToggle={onWishlist} />
      </div>
      <button className="pdp-card-copy" onClick={() => select(p)}>
        <span>{p.name}</span>
        <strong>${p.price}.00</strong>
        <small>{p.category} · UNFRAMED PRINT</small>
      </button>
    </article>
  );
}

function PosterShelf({ eyebrow, title, description, products, select, wishlist, onWishlist }) {
  if (!products.length) return null;
  return (
    <section className="pdp-shelf">
      <div className="pdp-shelf-heading">
        <div>
          <p className="pdp-eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <p>{description}</p>
      </div>
      <div className="pdp-shelf-grid">
        {products.map((item) => (
          <ProductPosterCard key={item.id} p={item} select={select} wishlist={wishlist} onWishlist={onWishlist} />
        ))}
      </div>
    </section>
  );
}

function ReviewsDrawer({ product, close }) {
  const [sort, setSort] = useState('recent');
  const reviews = useMemo(() => {
    const items = [...SAMPLE_REVIEWS];
    return sort === 'highest' ? items.sort((a, b) => b.rating - a.rating) : items;
  }, [sort]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    const onKeyDown = (event) => event.key === 'Escape' && close();
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [close]);

  return (
    <div className="review-layer" role="presentation">
      <button className="review-scrim" aria-label="Close reviews" onClick={close} />
      <aside className="review-drawer" role="dialog" aria-modal="true" aria-labelledby="review-title">
        <div className="review-head">
          <div>
            <p className="pdp-eyebrow">POSTERI COMMUNITY</p>
            <h2 id="review-title">Reviews</h2>
            <span>{product.name}</span>
          </div>
          <button type="button" className="review-close" aria-label="Close reviews" onClick={close}><X /></button>
        </div>
        <div className="review-content">
          <div className="review-note">Preview content · These sample reviews are illustrative and are not customer submissions.</div>
          <section className="review-summary" aria-label="Sample rating summary">
            <strong>4.8</strong>
            <div><span className="review-stars" aria-label="4.8 out of 5 stars">★★★★★</span><small>Sample rating · {SAMPLE_REVIEWS.length} preview reviews</small></div>
          </section>
          <div className="review-breakdown" aria-label="Sample rating distribution">
            {[5, 4, 3, 2, 1].map((rating) => {
              const count = SAMPLE_REVIEWS.filter((item) => item.rating === rating).length;
              return <div className="review-bar-row" key={rating}><span>{rating} <Star /></span><span className="review-bar"><i style={{ width: `${(count / SAMPLE_REVIEWS.length) * 100}%` }} /></span><small>{count}</small></div>;
            })}
          </div>
          <label className="review-sort">SORT REVIEWS
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="recent">Most recent</option>
              <option value="highest">Highest rated</option>
            </select>
          </label>
          <div className="review-list">
            {reviews.map((review, index) => (
              <article className="review-entry" key={`${review.title}-${index}`}>
                <div className="review-entry-meta"><span className="review-stars" aria-label={`${review.rating} out of 5 stars`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span><time>{review.date}</time></div>
                <h3>{review.title}</h3>
                <p>{review.body}</p>
                <small>POSTERI sample</small>
              </article>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

export function ProductPage({ p, products, go, add, wishlist, onWishlist, select, signedIn }) {
  const [size, setSize] = useState('16 × 24 in');
  const [qty, setQty] = useState(1);
  const [showReviews, setShowReviews] = useState(false);
  const [showMockup, setShowMockup] = useState(false);
  const otherInDepartment = (item) => item.department === p.department && item.id !== p.id;
  const pairings = products.filter((item) => otherInDepartment(item) && item.subcategory !== p.subcategory).slice(0, 4);
  const similar = products.filter((item) => otherInDepartment(item) && item.category === p.category && item.subcategory === p.subcategory).slice(0, 4);
  const fallbackSimilar = similar.length ? similar : products.filter((item) => otherInDepartment(item) && item.category === p.category).slice(0, 4);
  const isSaved = wishlist.includes(p.id);

  return (
    <main className="product-page pdp-page">
      <button className="back" onClick={() => go('catalog')}><ArrowLeft /> Back to posters</button>
      <div className="pdp-breadcrumb">POSTERI <span>/</span> {p.department.toUpperCase()} <span>/</span> {p.category.toUpperCase()}</div>
      <section className="pdp-overview">
        <div className="pdp-gallery">
          <button className={`pdp-main-image ${showMockup ? 'show-wall' : ''}`} onClick={() => setShowMockup((value) => !value)} aria-label={showMockup ? 'Show the poster artwork' : 'Show the poster on a wall'}>
            {showMockup ? <PosterMockup product={p} className="pdp-wall-preview" /> : <img src={posterSrc(p)} alt={`${p.name} poster artwork`} />}
            <span>{showMockup ? 'ON A WALL' : 'THE PRINT'}</span>
          </button>
          <div className="pdp-gallery-thumbs" aria-label="Poster views">
            <button className={!showMockup ? 'selected' : ''} onClick={() => setShowMockup(false)} aria-label="View poster artwork"><img src={posterSrc(p)} alt="" /></button>
            <button className={showMockup ? 'selected' : ''} onClick={() => setShowMockup(true)} aria-label="View poster on a wall"><PosterMockup product={p} className="pdp-thumb-wall" /></button>
            <span>Click the image to switch views</span>
          </div>
        </div>

        <div className="pdp-details">
          <p className="pdp-eyebrow">{p.department} · {p.subcategory}</p>
          <div className="pdp-title-row"><h1>{p.name}</h1><WishlistButton p={p} saved={isSaved} onToggle={onWishlist} className="pdp-wish" /></div>
          <p className="pdp-price">${p.price}.00 <small>USD</small></p>
          <button className="pdp-review-trigger" onClick={() => setShowReviews(true)}>
            <span className="review-stars" aria-hidden="true">★★★★★</span>
            <span>Reviews</span>
            <small>Sample preview</small>
            <ArrowRight />
          </button>
          <p className="pdp-description">{p.desc}</p>
          <div className="pdp-size-block">
            <div className="pdp-option-label"><strong>Choose a size</strong><span>{size}</span></div>
            <div className="pdp-sizes">{['8 × 12 in', '16 × 24 in', '24 × 36 in'].map((item) => <button key={item} className={size === item ? 'selected' : ''} aria-pressed={size === item} onClick={() => setSize(item)}>{item}</button>)}</div>
            <p>Unframed poster · heavyweight matte paper</p>
          </div>
          <div className="pdp-add-row">
            <div className="pdp-quantity" aria-label="Quantity">
              <button aria-label="Decrease quantity" onClick={() => setQty((value) => Math.max(1, value - 1))}><Minus /></button>
              <span>{qty}</span>
              <button aria-label="Increase quantity" onClick={() => setQty((value) => value + 1)}><Plus /></button>
            </div>
            <button className="primary" onClick={() => add(p, qty, size)}>Add to bag — ${p.price * qty} <ArrowRight /></button>
          </div>
          <p className="pdp-order-note">Printed to order · No frame included</p>

          <div className="pdp-accordions">
            <details open>
              <summary>Description &amp; design <ChevronDown /></summary>
              <p>{p.desc} Created as a statement print for a personal space, studio, or collected gallery wall.</p>
            </details>
            <details>
              <summary>Paper &amp; materials <ChevronDown /></summary>
              <p>Printed on heavyweight 230 gsm matte art paper with archival pigment inks. The print is supplied unframed so you can choose the finish that suits your room.</p>
            </details>
            <details>
              <summary>Delivery &amp; returns <ChevronDown /></summary>
              <p>Each poster is printed to order and prepared for shipping in 2–4 business days. Delivery timing and return options are confirmed during checkout.</p>
            </details>
            <details>
              <summary>Payment <ChevronDown /></summary>
              <p>Payment options are shown at checkout. This preview does not process a real payment.</p>
            </details>
          </div>
          {!signedIn && <p className="pdp-signin-hint"><Heart /> Sign in to save this print to your wishlist.</p>}
        </div>
      </section>

      <PosterShelf eyebrow="MAKE IT A COLLECTION" title="Complete the wall" description="Find a print with a different point of view to hang alongside it." products={pairings} select={select} wishlist={wishlist} onWishlist={onWishlist} />
      <PosterShelf eyebrow="MORE TO DISCOVER" title="Similar posters" description="More artwork from the same corner of the POSTERI universe." products={fallbackSimilar} select={select} wishlist={wishlist} onWishlist={onWishlist} />

      <section className="pdp-room-preview">
        <div><p className="pdp-eyebrow">A LITTLE CONTEXT</p><h2>See it on your wall.</h2><p>Every poster is unframed, ready to make its own place in your space.</p><button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Back to the print <ArrowLeft /></button></div>
        <PosterMockup product={p} className="pdp-room-scene" />
      </section>
      {showReviews && <ReviewsDrawer product={p} close={() => setShowReviews(false)} />}
    </main>
  );
}

export function WishlistPage({ products, wishlist, onWishlist, select, go }) {
  const saved = products.filter((item) => wishlist.includes(item.id));
  return (
    <main className="wishlist-page">
      <p className="pdp-breadcrumb">POSTERI <span>/</span> YOUR ACCOUNT <span>/</span> WISHLIST</p>
      <div className="wishlist-heading"><div><p className="pdp-eyebrow">YOUR PERSONAL EDIT</p><h1>Saved posters</h1><p>Good things, all in one place.</p></div><span>{saved.length} {saved.length === 1 ? 'POSTER' : 'POSTERS'}</span></div>
      {saved.length ? <div className="pdp-shelf-grid wishlist-grid">{saved.map((item) => <ProductPosterCard key={item.id} p={item} select={select} wishlist={wishlist} onWishlist={onWishlist} />)}</div> : <div className="wishlist-empty"><Heart /><h2>Your wishlist is waiting.</h2><p>Save a poster you love and it will be here when you come back.</p><button className="primary" onClick={() => go('catalog')}>Explore posters <ArrowRight /></button></div>}
    </main>
  );
}

export function Auth({ close, onSuccess, intent = 'account', productName }) {
  const [create, setCreate] = useState(false);
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const supabaseEnabled = hasSupabaseConfig();
  const heading = intent === 'wishlist' ? 'Sign in to save your favourite.' : intent === 'favorites' ? 'Your saved posters await.' : create ? 'Make it yours.' : 'Welcome back.';
  const description = intent === 'wishlist' ? `${productName || 'This poster'} will be added to your wishlist when you continue.` : intent === 'favorites' ? 'Sign in to see the posters you have saved.' : supabaseEnabled ? 'Sign in or create your POSTERI account.' : 'Sign in or create a POSTERI preview account.';
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!supabaseEnabled) { setDone(true); onSuccess(); return; }
    setSubmitting(true);
    const supabase = createSupabaseClient();
    const result = create
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } })
      : await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (result.error) { setError(result.error.message); return; }
    if (create && !result.data.session) { setConfirmationPending(true); setDone(true); return; }
    setDone(true);
    onSuccess();
  };

  return <div className="modal-wrap auth-wrap" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <form className="auth" onSubmit={submit}>
      <button type="button" className="close" aria-label="Close sign in" onClick={close}><X /></button>
      {done ? <><Check className="done" /><p className="pdp-eyebrow">{supabaseEnabled ? 'POSTERI ACCOUNT' : 'PREVIEW ACCOUNT'}</p><h2>{confirmationPending ? 'Check your inbox.' : intent === 'wishlist' ? 'Saved to your wishlist.' : 'You’re in.'}</h2><p>{confirmationPending ? 'Confirm your email address to finish creating your POSTERI account.' : intent === 'wishlist' ? `${productName || 'Your poster'} is now in your saved collection.` : supabaseEnabled ? 'Your POSTERI account is active on this device.' : 'Your preview session is active on this page.'}</p><button type="button" className="primary" onClick={close}>Continue <ArrowRight /></button></> : <>
        <p className="pdp-eyebrow">{create ? 'JOIN POSTERI' : 'YOUR POSTERI ACCOUNT'}</p><h2>{heading}</h2><p className="auth-description">{description}</p>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" aria-label="Email address" required />
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" aria-label="Password" minLength="6" required />
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="primary" disabled={submitting}>{submitting ? 'Please wait…' : create ? 'Create account' : 'Sign in'} <ArrowRight /></button>
        {intent === 'account' && <button type="button" className="switch" onClick={() => setCreate((value) => !value)}>{create ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>}
        <small className="auth-demo-note">{supabaseEnabled ? 'Your credentials are handled by Supabase Auth.' : 'Preview only · credentials are not sent or stored. Demo sign-in and saved posters stay in this browser; no account backend is connected.'}</small>
      </>}
    </form>
  </div>;
}

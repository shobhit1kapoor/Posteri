'use client';

import { useEffect, useState } from 'react';

import { createClient as createSupabaseClient, hasSupabaseConfig } from '../../lib/supabase/client';
import styles from './test-printkk.module.css';

const CONFIRMATION = 'ORDER WITH MY PRINTKK WALLET';

const initialAddress = {
  recipientName: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postalCode: '',
  countryCode: 'US',
  phone: '',
};

export default function TestPrintKKForm() {
  const [owner, setOwner] = useState(null);
  const [loadingOwner, setLoadingOwner] = useState(true);
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState(initialAddress);
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      setLoadingOwner(false);
      return;
    }
    const supabase = createSupabaseClient();
    supabase.auth.getUser().then(({ data }) => {
      setOwner(data.user ?? null);
      setEmail(data.user?.email ?? '');
      setLoadingOwner(false);
    });
  }, []);

  const setAddressField = (field, value) => {
    setAddress((current) => ({ ...current, [field]: field === 'countryCode' ? value.toUpperCase() : value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setMessage(null);
    setSubmitting(true);
    try {
      const response = await fetch('/api/admin/printkk-test-order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, shippingAddress: address, confirmation }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The PrintKK test could not be submitted.');
      setMessage({ type: 'success', text: `${result.message} POSTERI order ${result.orderId}; PrintKK order ${result.printKKOrderId}.` });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'The PrintKK test could not be submitted.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingOwner) return <p className={styles.loading}>Checking owner access…</p>;
  if (!hasSupabaseConfig()) return <p className={styles.error}>Supabase authentication is unavailable, so the supplier-wallet test remains locked.</p>;
  if (!owner) {
    return <div className={styles.signIn}><strong>Sign in first</strong><p>Use the POSTERI account tied to the owner email, then reload this private page.</p><a href="/">Open POSTERI sign-in</a></div>;
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <h2>Delivery address</h2>
      <label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Recipient name<input required value={address.recipientName} onChange={(event) => setAddressField('recipientName', event.target.value)} /></label>
      <label>Address<input required value={address.line1} onChange={(event) => setAddressField('line1', event.target.value)} /></label>
      <label>Apartment / suite (optional)<input value={address.line2} onChange={(event) => setAddressField('line2', event.target.value)} /></label>
      <div className={styles.grid}>
        <label>City<input required value={address.city} onChange={(event) => setAddressField('city', event.target.value)} /></label>
        <label>State / region<input required value={address.region} onChange={(event) => setAddressField('region', event.target.value)} /></label>
        <label>ZIP / postal code<input required value={address.postalCode} onChange={(event) => setAddressField('postalCode', event.target.value)} /></label>
        <label>Country code<input required maxLength="2" value={address.countryCode} onChange={(event) => setAddressField('countryCode', event.target.value)} /></label>
      </div>
      <label>Phone (optional)<input type="tel" value={address.phone} onChange={(event) => setAddressField('phone', event.target.value)} /></label>
      <div className={styles.confirm}>
        <strong>Final confirmation</strong>
        <span>Type <code>{CONFIRMATION}</code> to create and pay for this PrintKK order from your wallet.</span>
        <input required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} aria-label="Wallet charge confirmation" />
      </div>
      {message && <p className={message.type === 'success' ? styles.success : styles.error} role="alert">{message.text}</p>}
      <button type="submit" disabled={submitting || confirmation !== CONFIRMATION}>
        {submitting ? 'Submitting to PrintKK…' : 'Create and pay for one PrintKK test order'}
      </button>
    </form>
  );
}

import TestPrintKKForm from './test-printkk-form';
import styles from './test-printkk.module.css';

export const metadata = {
  title: 'Private PrintKK test',
  robots: { index: false, follow: false },
};

export default function TestPrintKKPage() {
  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <p className={styles.eyebrow}>POSTERI · OWNER TOOL</p>
        <h1>PrintKK wallet test</h1>
        <p className={styles.intro}>
          Submit one real, smallest configured print directly to PrintKK. This bypasses customer payment only for this owner test.
        </p>
        <div className={styles.notice}>
          <strong>This creates a real supplier order.</strong>
          <span>PrintKK will charge your wallet and ship to the address below. It is not visible in the storefront and records $0 customer revenue.</span>
        </div>
        <div className={styles.product}>
          <img src="/posters/5.png" alt="Le Mans ZebraWin poster artwork" />
          <div>
            <p>Configured test print</p>
            <h2>Le Mans · #ZEBRAWIN</h2>
            <span>8 × 12 in · Matte · one copy</span>
          </div>
        </div>
        <TestPrintKKForm />
      </section>
    </main>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as usageApi from "../api/usageApi";
import { ApiError } from "../api/client";
import type { PlanDto } from "../api/usageTypes";
import { useAuth } from "../auth/useAuth";
import { AccountMenu } from "../components/AccountMenu";
import { ErrorBanner } from "../components/ErrorBanner";
import { BackArrowIcon } from "../components/icons";
import { Spinner } from "../components/Spinner";
import { UsageBar } from "../usage/UsageBar";
import { UsageRing } from "../usage/UsageRing";
import { useUsage } from "../usage/useUsage";
import styles from "./BillingPage.module.css";

function toError(err: unknown): ApiError | Error {
  if (err instanceof ApiError || err instanceof Error) return err;
  return new Error("Something went wrong.");
}

function formatCredits(plan: PlanDto): string {
  if (plan.isTrial) return `${plan.lifetimeCredits} credits, one time`;
  return `${plan.dailyCredits}/day · ${plan.weeklyCredits}/week`;
}

export function BillingPage() {
  const { accessToken } = useAuth();
  const { usage } = useUsage();

  const [plans, setPlans] = useState<PlanDto[] | null>(null);
  const [currentPlanKey, setCurrentPlanKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    usageApi
      .getPlans(accessToken, controller.signal)
      .then((response) => {
        setPlans(response.plans);
        setCurrentPlanKey(response.currentPlanKey);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoadError(toError(err));
      });
    return () => controller.abort();
  }, [accessToken]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.backIconLink} aria-label="Back to chats" title="Back to chats">
          <BackArrowIcon />
        </Link>
        <h1 className={styles.title}>Billing</h1>
        <div className={styles.headerActions}>
          <UsageRing />
          <AccountMenu />
        </div>
      </header>

      <main className={styles.main}>
        {loadError && <ErrorBanner error={loadError} onDismiss={() => setLoadError(null)} />}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Your usage</h2>
          {!usage && (
            <div className={styles.loading}>
              <Spinner label="Loading usage..." />
            </div>
          )}
          {usage && (
            <div className={styles.usageCard}>
              <div className={styles.usagePlanRow}>
                <span className={styles.usagePlanName}>{usage.planDisplayName}</span>
                {usage.isTrial && <span className={styles.trialBadge}>One-time trial</span>}
              </div>

              {usage.isTrial && usage.trial && (
                <UsageBar label="Trial credits" used={usage.trial.used} held={usage.trial.held} cap={usage.trial.granted} />
              )}
              {!usage.isTrial && usage.daily && (
                <UsageBar
                  label="Today"
                  used={usage.daily.used}
                  held={usage.daily.held}
                  cap={usage.daily.cap}
                  resetsAtUtc={usage.daily.resetsAtUtc}
                />
              )}
              {!usage.isTrial && usage.weekly && (
                <UsageBar
                  label="This week"
                  used={usage.weekly.used}
                  held={usage.weekly.held}
                  cap={usage.weekly.cap}
                  resetsAtUtc={usage.weekly.resetsAtUtc}
                />
              )}

              {usage.isTrial && usage.trial && usage.trial.remaining === 0 && (
                <p className={styles.exhaustedNote}>
                  Your trial credits are used up. Subscribe to a plan below to keep generating.
                </p>
              )}
            </div>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Plans</h2>
          <p className={styles.note}>
            Changing plans isn't available in this preview yet - this list is for comparison only.
          </p>

          {!plans && !loadError && (
            <div className={styles.loading}>
              <Spinner label="Loading plans..." />
            </div>
          )}

          {plans && (
            <div className={styles.planGrid}>
              {plans.map((plan) => (
                <div key={plan.key} className={plan.key === currentPlanKey ? styles.planCardCurrent : styles.planCard}>
                  {plan.key === currentPlanKey && <span className={styles.currentBadge}>Current plan</span>}
                  <div className={styles.planName}>{plan.displayName}</div>
                  <div className={styles.planPrice}>{plan.isTrial ? "Free" : `$${plan.priceUsd}/mo`}</div>
                  <p className={styles.planDescription}>{plan.description}</p>
                  <div className={styles.planCredits}>{formatCredits(plan)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

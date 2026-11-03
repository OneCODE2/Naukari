/**
 * Runs a child branch on /candidate/opportunities/ without re-tailoring.
 * Directly applies to recommended opportunities that match the newly updated profile.
 */

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes the opportunities branch.
 * @param {import('playwright-core').BrowserContext} context
 * @param {object} opts
 * @param {boolean} opts.live
 * @param {number} opts.maxBranchApplies - Max applies to perform in this branch (e.g. 3-5)
 * @param {function} opts.log - Logging function
 * @param {function} opts.onApplied - Callback when an application is made
 * @param {Set<import('playwright-core').Page>} opts.guard - Set of pages to ignore in main wire
 * @returns {Promise<number>} Number of jobs applied in this branch
 */
async function runOpportunitiesBranch(context, {
  live = false,
  maxBranchApplies = 3,
  log = console.log,
  onApplied = () => {},
  guard = new Set(),
} = {}) {
  log('🌿 [Tree] Starting child branch: checking recommended jobs on Opportunities page...');
  const oppPage = await context.newPage();
  guard.add(oppPage);

  let branchAppliedCount = 0;

  try {
    await oppPage.goto('https://www.instahyre.com/candidate/opportunities/', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await sleep(3500);

    const isLogin = await oppPage.evaluate(() => {
      const txt = document.body.innerText || '';
      return /sign in|log in to continue/i.test(txt) && !/sign out/i.test(txt);
    });
    if (isLogin) {
      log('🌿 [Tree] Opportunities page not authenticated. Skipping branch.');
      return branchAppliedCount;
    }

    // Loop through recommended opportunity cards
    for (let pass = 0; pass < 8 && branchAppliedCount < maxBranchApplies; pass++) {
      // Find candidate cards or view job buttons
      const cardInfo = await oppPage.evaluate(() => {
        // Look for bulk button or single apply
        const bulkBtn = document.querySelector('button[ng-click*="applyBulk"]');
        if (bulkBtn && bulkBtn.offsetParent !== null) {
          const txt = (bulkBtn.innerText || '').trim();
          return { type: 'bulk', text: txt };
        }

        const singleBtn = document.querySelector('.apply[ng-click*="submitChoice"] .new-btn, button[ng-click*="submitChoice"], button[ng-click*="apply"]:not([ng-click*="applyBulk"])');
        if (singleBtn && singleBtn.offsetParent !== null) {
          const txt = (singleBtn.innerText || '').trim();
          if (/apply/i.test(txt)) {
            return { type: 'single', text: txt };
          }
        }

        // Look for View Job buttons
        const viewBtns = Array.from(document.querySelectorAll('button.btn-interested, button'))
          .filter(b => b.offsetParent !== null && /view job/i.test((b.innerText || '').trim()));

        if (viewBtns.length > 0) {
          const btn = viewBtns[0];
          // Grab card text/title for logging
          let cardEl = btn.parentElement;
          for (let i = 0; i < 6 && cardEl; i++) {
            if (/view job/i.test(cardEl.innerText || '')) break;
            cardEl = cardEl.parentElement;
          }
          const cardText = cardEl ? (cardEl.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 100) : 'Opportunity';
          return { type: 'view', text: cardText };
        }

        return null;
      });

      if (!cardInfo) {
        log('🌿 [Tree] No more unapplied recommended cards found on Opportunities.');
        break;
      }

      if (cardInfo.type === 'bulk') {
        log(`🌿 [Tree] Found bulk apply on Opportunities: "${cardInfo.text}"`);
        if (live) {
          await oppPage.click('button[ng-click*="applyBulk"]');
          await sleep(2000);
        } else {
          log('🌿 [Tree] DRY RUN — would click bulk apply on Opportunities.');
        }
        branchAppliedCount++;
        onApplied({ title: `Recommended Bulk (${cardInfo.text})`, company: 'Instahyre Opportunities' });
        break;
      } else if (cardInfo.type === 'single') {
        log(`🌿 [Tree] Found direct single apply on Opportunities: "${cardInfo.text}"`);
        if (live) {
          await oppPage.click('.apply[ng-click*="submitChoice"] .new-btn, button[ng-click*="submitChoice"], button[ng-click*="apply"]:not([ng-click*="applyBulk"])');
          await sleep(2000);
        } else {
          log('🌿 [Tree] DRY RUN — would click single apply on Opportunities.');
        }
        branchAppliedCount++;
        onApplied({ title: 'Recommended Opportunity', company: 'Instahyre Opportunities' });
        await sleep(3000);
        continue;
      } else if (cardInfo.type === 'view') {
        log(`🌿 [Tree] Opening recommended job card: "${cardInfo.text}"`);
        
        // Wait for job modal or detail view
        await oppPage.evaluate(() => {
          const viewBtns = Array.from(document.querySelectorAll('button.btn-interested, button'))
            .filter(b => b.offsetParent !== null && /view job/i.test((b.innerText || '').trim()));
          if (viewBtns[0]) viewBtns[0].click();
        });
        await sleep(2500);

        // Click Apply inside the modal/job without tailoring
        const appliedModal = await oppPage.evaluate((isLive) => {
          const applyBtn = document.querySelector('button[ng-click*="submitChoice"], button[ng-click*="apply"], button.btn-apply, .modal button');
          if (applyBtn && /apply/i.test(applyBtn.innerText || '')) {
            if (isLive) applyBtn.click();
            return true;
          }
          return false;
        }, live);

        if (appliedModal) {
          log(live ? '🌿 [Tree] ✅ Direct applied to recommended job without tailoring.' : '🌿 [Tree] 🔍 DRY RUN: Direct apply located and skipped tailoring.');
          branchAppliedCount++;
          onApplied({ title: cardInfo.text, company: 'Recommended Opportunity' });
        } else {
          log('🌿 [Tree] No apply button found in opened modal. Closing modal or moving to next.');
          await oppPage.keyboard.press('Escape').catch(() => {});
        }
        await sleep(3000);
      }
    }

    log(`🌿 [Tree] Opportunities branch finished. Applied to ${branchAppliedCount} recommended job(s). Returning to root search.`);
  } catch (err) {
    log(`🌿 [Tree] Opportunities branch error: ${err.message}`);
  } finally {
    guard.delete(oppPage);
    await oppPage.close().catch(() => {});
  }

  return branchAppliedCount;
}

module.exports = { runOpportunitiesBranch };

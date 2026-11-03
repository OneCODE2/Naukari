/**
 * Option B: Extracts and applies to similar/recommended jobs directly from the current job page or modal.
 * Does not re-tailor or modify the candidate profile for child leaf nodes.
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extracts similar or related job links from the given page or modal.
 * Inspects both the full document and modal containers for job links.
 * 
 * @param {import('playwright-core').Page} page
 * @param {string} currentJobUrl
 * @returns {Promise<Array<{ url: string, title: string, company: string }>>}
 */
async function extractSimilarJobs(page, currentJobUrl = '') {
  return await page.evaluate((currUrl) => {
    const results = [];
    const seenUrls = new Set();
    if (currUrl) {
      try {
        const u = new URL(currUrl, location.origin);
        seenUrls.add(u.pathname);
      } catch (_) {}
    }

    // Identify candidate sections or containers for similar/related jobs
    // Instahyre often places "Similar Jobs", "Other jobs at this company", or "Recommended for you"
    // in sidebars, below description, or in cards.
    const allAnchors = Array.from(document.querySelectorAll('a[href*="/job-"], a[href*="/job/"]'));

    for (const a of allAnchors) {
      const href = a.getAttribute('href');
      if (!href) continue;

      let fullPath = '';
      try {
        const parsed = new URL(href, location.origin);
        fullPath = parsed.pathname;
      } catch (_) {
        fullPath = href.split('?')[0].split('#')[0];
      }

      if (!/\/job[s]?[/-]\d+/.test(fullPath)) continue;
      if (seenUrls.has(fullPath)) continue;

      // Ensure it is visible or part of a similar/related jobs container
      const text = (a.innerText || a.textContent || '').replace(/\s+/g, ' ').trim();
      
      // Look for parent card context
      let cardEl = a.parentElement;
      for (let i = 0; i < 5 && cardEl; i++) {
        if (cardEl.classList && (cardEl.classList.contains('job-card') || cardEl.classList.contains('opportunity-card') || cardEl.classList.contains('similar-job'))) {
          break;
        }
        cardEl = cardEl.parentElement;
      }

      const cardText = cardEl ? (cardEl.innerText || '').replace(/\s+/g, ' ').trim() : text;
      
      // Simple title & company heuristic from text
      let title = text || 'Similar Opportunity';
      let company = '';
      if (cardText && cardText !== text) {
        const parts = cardText.split(/\s*[-–|@]\s*/);
        if (parts.length > 1) {
          title = parts[0].trim();
          company = parts[1].trim();
        }
      }

      seenUrls.add(fullPath);
      results.push({
        url: new URL(fullPath, location.origin).href,
        title: title.slice(0, 100),
        company: company.slice(0, 80),
      });

      if (results.length >= 10) break;
    }

    return results;
  }, currentJobUrl).catch(() => []);
}

/**
 * Runs the Similar Jobs branch (Option B) for the currently active job.
 * 
 * @param {import('playwright-core').BrowserContext} context
 * @param {import('playwright-core').Page} parentPage
 * @param {object} opts
 * @param {boolean} opts.live
 * @param {number} opts.maxBranchApplies - Max applies for this branch (default: 3)
 * @param {function} opts.log - Logging function
 * @param {function} opts.onApplied - Callback when a child job is applied
 * @param {Set<import('playwright-core').Page>} opts.guard - Pages set to ignore in main runner wire
 * @returns {Promise<number>} Number of child jobs applied
 */
async function runSimilarJobsBranch(context, parentPage, {
  live = false,
  maxBranchApplies = 3,
  log = console.log,
  onApplied = () => {},
  guard = new Set(),
} = {}) {
  log('🌿 [Option B] Checking for similar / related jobs on current job page...');
  let branchAppliedCount = 0;

  try {
    const parentUrl = parentPage.url();
    const similarJobs = await extractSimilarJobs(parentPage, parentUrl);

    if (!similarJobs || similarJobs.length === 0) {
      log('🌿 [Option B] No similar job links detected on this page/modal.');
      return 0;
    }

    log(`🌿 [Option B] Found ${similarJobs.length} similar job(s). Processing up to ${maxBranchApplies}...`);

    for (const jobItem of similarJobs) {
      if (branchAppliedCount >= maxBranchApplies) break;

      log(`🌿 [Option B] Opening child job: "${jobItem.title}" (${jobItem.url})`);
      const childPage = await context.newPage();
      guard.add(childPage);

      try {
        await childPage.goto(jobItem.url, {
          waitUntil: 'domcontentloaded',
          timeout: 40000,
        });
        await sleep(3000);

        // Check if page requires login or is already applied
        const pageState = await childPage.evaluate(() => {
          const bodyText = (document.body.innerText || '').toLowerCase();
          if (bodyText.includes('sign in') && !bodyText.includes('sign out')) {
            return { status: 'logged_out' };
          }
          if (bodyText.includes('applied') || bodyText.includes('application sent')) {
            return { status: 'already_applied' };
          }

          // Look for direct apply buttons
          const applyBtn = document.querySelector(
            'button[ng-click*="submitChoice"], button[ng-click*="apply"]:not([ng-click*="applyBulk"]), button.btn-apply, .apply .new-btn, button.btn-interested'
          );
          if (applyBtn && applyBtn.offsetParent !== null) {
            const btnText = (applyBtn.innerText || '').trim();
            if (/apply/i.test(btnText)) {
              return { status: 'ready', btnText };
            }
          }

          return { status: 'not_found' };
        });

        if (pageState.status === 'logged_out') {
          log('🌿 [Option B] Child job page shows logged out. Stopping branch.');
          break;
        }

        if (pageState.status === 'already_applied') {
          log('🌿 [Option B] Child job already applied. Skipping.');
          continue;
        }

        if (pageState.status === 'ready') {
          log(`🌿 [Option B] Found Apply button ("${pageState.btnText}"). Direct applying without tailoring...`);
          if (live) {
            await childPage.evaluate(() => {
              const applyBtn = document.querySelector(
                'button[ng-click*="submitChoice"], button[ng-click*="apply"]:not([ng-click*="applyBulk"]), button.btn-apply, .apply .new-btn, button.btn-interested'
              );
              if (applyBtn) applyBtn.click();
            });
            await sleep(2000);
            log(`🌿 [Option B] ✅ Direct applied to child job: ${jobItem.title}`);
          } else {
            log(`🌿 [Option B] 🔍 DRY RUN: Would click Apply on child job: ${jobItem.title}`);
          }

          branchAppliedCount++;
          onApplied({
            title: jobItem.title,
            company: jobItem.company || 'Similar Job',
            link: jobItem.url,
          });
          await sleep(2500);
        } else {
          log('🌿 [Option B] No direct Apply button found on child job page.');
        }
      } catch (childErr) {
        log(`🌿 [Option B] Error handling child job ${jobItem.url}: ${childErr.message}`);
      } finally {
        guard.delete(childPage);
        await childPage.close().catch(() => {});
      }
    }

    log(`🌿 [Option B] Similar jobs branch finished. Applied to ${branchAppliedCount} child job(s). Backtracking to parent.`);
  } catch (err) {
    log(`🌿 [Option B] Branch error: ${err.message}`);
  }

  return branchAppliedCount;
}

module.exports = {
  extractSimilarJobs,
  runSimilarJobsBranch,
};


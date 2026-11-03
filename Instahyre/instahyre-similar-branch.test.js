const assert = require('assert');
const { extractSimilarJobs } = require('./instahyre-similar-branch');

// Unit test mock page evaluating DOM
async function testSimilarJobsExtraction() {
  const mockPage = {
    url: () => 'https://www.instahyre.com/job-100-primary-java-role',
    evaluate: async (fn, arg) => {
      // Mock DOM environment inside evaluate
      const globalDoc = {
        querySelectorAll: (sel) => {
          return [
            {
              getAttribute: (name) => (name === 'href' ? '/job-101-similar-spring-boot-role' : null),
              innerText: 'Senior Java Backend Engineer - TechCorp',
              parentElement: null,
            },
            {
              getAttribute: (name) => (name === 'href' ? 'https://www.instahyre.com/job-100-primary-java-role' : null), // Self reference
              innerText: 'Primary Java Role',
              parentElement: null,
            },
            {
              getAttribute: (name) => (name === 'href' ? '/job-102-microservices-developer' : null),
              innerText: 'Microservices Developer - CloudWorks',
              parentElement: null,
            },
            {
              getAttribute: (name) => (name === 'href' ? '/candidate/profile' : null), // Non-job link
              innerText: 'Profile',
              parentElement: null,
            }
          ];
        }
      };

      const originalDoc = global.document;
      const originalLocation = global.location;
      try {
        global.document = globalDoc;
        global.location = { origin: 'https://www.instahyre.com' };
        return await fn(arg);
      } finally {
        global.document = originalDoc;
        global.location = originalLocation;
      }
    }
  };

  const results = await extractSimilarJobs(mockPage, mockPage.url());
  assert.strictEqual(results.length, 2, 'Should extract exactly 2 unique child jobs, ignoring self and non-job links');
  assert.strictEqual(results[0].url, 'https://www.instahyre.com/job-101-similar-spring-boot-role');
  assert.strictEqual(results[1].url, 'https://www.instahyre.com/job-102-microservices-developer');
  console.log('instahyre-similar-branch: all unit tests passed');
}

testSimilarJobsExtraction().catch((err) => {
  console.error('instahyre-similar-branch test failed:', err);
  process.exit(1);
});


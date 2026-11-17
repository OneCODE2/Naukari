function isJobPageUrl(url) {
  return typeof url === 'string' && /\/job-\d+/.test(url);
}

function isJobTabDoneMessage(msg) {
  if (typeof msg !== 'string') return false;
  return /JOB_TAB_DONE|Already applied|This job was already opened|not applying to this low-score job|No Apply button on this job|Job page did not finish loading|✅ applied|DRY_RUN — would click: "Apply"/i.test(msg);
}

function shouldCloseJobTab({ url, message }) {
  return isJobPageUrl(url) && isJobTabDoneMessage(message);
}

module.exports = {
  isJobPageUrl,
  isJobTabDoneMessage,
  shouldCloseJobTab,
};

import { ext } from '../shared/browser-api';
import { debug } from '../shared/logging';

// Placeholder wiring; the release service lands in the integration phase.
ext.runtime.onMessage.addListener(() => {
  debug('message received');
  return false;
});

ext.action.onClicked.addListener(() => {
  void ext.runtime.openOptionsPage();
});

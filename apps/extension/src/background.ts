/// <reference path="./chrome.d.ts" />
import { flushQueue } from './queue';

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onStartup.addListener(() => {
  void flushQueue();
});

chrome.alarms.create('nordly-capture-flush', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(() => {
  void flushQueue();
});

void flushQueue();

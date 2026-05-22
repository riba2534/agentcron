import type { CalendarEntry } from './cronToCalendar.js';

export interface PlistRenderInput {
  taskId: string;
  runnerBinPath: string;
  calendarIntervals: CalendarEntry[];
  home: string;
  dbUrl: string;
  logDir: string;
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const renderInterval = (entry: CalendarEntry): string => {
  const parts: string[] = [];
  if (entry.Minute !== undefined) parts.push(`<key>Minute</key><integer>${entry.Minute}</integer>`);
  if (entry.Hour !== undefined) parts.push(`<key>Hour</key><integer>${entry.Hour}</integer>`);
  if (entry.Day !== undefined) parts.push(`<key>Day</key><integer>${entry.Day}</integer>`);
  if (entry.Month !== undefined) parts.push(`<key>Month</key><integer>${entry.Month}</integer>`);
  if (entry.Weekday !== undefined)
    parts.push(`<key>Weekday</key><integer>${entry.Weekday}</integer>`);
  return `    <dict>\n      ${parts.join('\n      ')}\n    </dict>`;
};

export function renderPlist(input: PlistRenderInput): string {
  const intervalsXml =
    input.calendarIntervals.length === 0
      ? '    <dict><key>Minute</key><integer>0</integer></dict>'
      : input.calendarIntervals.map(renderInterval).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.cct.task.${xmlEscape(input.taskId)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(input.runnerBinPath)}</string>
    <string>--task-id</string>
    <string>${xmlEscape(input.taskId)}</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
${intervalsXml}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>${xmlEscape(input.home)}</string>
    <key>CCT_DB_URL</key><string>${xmlEscape(input.dbUrl)}</string>
    <key>CCT_LOG_DIR</key><string>${xmlEscape(input.logDir)}</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${xmlEscape(input.logDir)}/launchd-${xmlEscape(input.taskId)}.out</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(input.logDir)}/launchd-${xmlEscape(input.taskId)}.err</string>
  <key>RunAtLoad</key><false/>
  <key>AbandonProcessGroup</key><true/>
  <key>ProcessType</key><string>Standard</string>
</dict>
</plist>
`;
}

export const PLIST_LABEL_PREFIX = 'com.cct.task.';

export const plistFileNameFor = (taskId: string) => `${PLIST_LABEL_PREFIX}${taskId}.plist`;
export const plistLabelFor = (taskId: string) => `${PLIST_LABEL_PREFIX}${taskId}`;

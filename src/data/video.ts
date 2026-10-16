// Demo video chapters. Times must match the rendered cut: tools/video/comp/publish-meta.mjs
// writes this file from the compositor timeline (tools/video/comp/timeline.js).
// Cut of 2026-10-16 (45.4 s): each scene's cross-fade starts 0.38 s before its
// chapter's whole second and has settled by it.
export const VIDEO = {
  mp4: '/video/floorlogic-demo.mp4',
  webm: '/video/floorlogic-demo.webm',
  poster: '/video/floorlogic-demo-poster.jpg',
  vtt: '/video/floorlogic-demo.vtt',
  seconds: 45,
  chapters: [
    { at: 0, label: 'Leads move themselves', detail: 'Pick a survey date' },
    { at: 6, label: 'Quote the job', detail: 'Cartons counted for you' },
    { at: 16, label: 'Customer approves', detail: 'On their phone' },
    { at: 24, label: 'Work order & invoice', detail: 'One click, then schedule' },
    { at: 34, label: 'Get paid', detail: 'Balance hits $0' },
    { at: 39, label: 'Know the profit', detail: 'Before and after commission' },
  ],
} as const;

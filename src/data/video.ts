// Demo video chapters. Times must match the rendered cut (the video track updates these).
// Cut of 2026-10-14 (45.4 s): each scene's cross-fade starts at x.75–x.85 s and has settled by
// the whole second used below.
export const VIDEO = {
  mp4: '/video/floorlogic-demo.mp4',
  webm: '/video/floorlogic-demo.webm',
  poster: '/video/floorlogic-demo-poster.jpg',
  vtt: '/video/floorlogic-demo.vtt',
  seconds: 45,
  chapters: [
    { at: 0, label: 'A lead is won', detail: 'Drag it to Approved' },
    { at: 5, label: 'Quote the job', detail: 'Cartons counted for you' },
    { at: 15, label: 'Customer approves', detail: 'On their phone' },
    { at: 24, label: 'Run the install', detail: 'One button, start to finish' },
    { at: 34, label: 'Get paid', detail: 'Balance hits $0' },
    { at: 40, label: 'Know the profit', detail: 'Estimate vs actual' },
  ],
} as const;

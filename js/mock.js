/* Placeholder community content. All names/handles are fictional placeholders. */
const MOCK = (() => {
  const now = Date.now(), m = 60e3, h = 3600e3;
  const athletes = [
    ['Anvil Annie', 84210, 'iron-mile'], ['Brick Ramos', 79120, 'dawn-patrol'], ['Coach Placeholder', 76340, 'iron-mile'],
    ['Slag Sarah', 70110, 'heavy-metal'], ['Tempered Tom', 66780, 'dawn-patrol'], ['Quench Quinn', 61200, 'heavy-metal'],
    ['Bellows Ben', 54990, 'iron-mile'], ['Rivet Rae', 48760, 'dawn-patrol'], ['Forge Frank', 41230, 'heavy-metal']
  ];
  const feed = [
    { ts: now - 4 * m, who: 'Anvil Annie', text: 'finished a 10K live run with 212 others 🏃' },
    { ts: now - 18 * m, who: 'Brick Ramos', text: 'joined crew <b>Dawn Patrol</b>' },
    { ts: now - 41 * m, who: 'Slag Sarah', text: 'passed a live check-in mid-deadlift 💪' },
    { ts: now - 2 * h, who: 'Coach Placeholder', text: 'is hosting <b>Iron Hour: Leg Day</b> tonight. RSVP open' },
    { ts: now - 3 * h, who: 'Tempered Tom', text: 'hit a 14-day streak (+50% max bonus) 🔥' },
    { ts: now - 5 * h, who: 'Quench Quinn', text: 'uploaded a verified treadmill screenshot ✅' },
    { ts: now - 7 * h, who: 'Rivet Rae', text: 'claimed 42.10 FIT to wallet (simulated)' }
  ];
  const crews = [
    { id: 'iron-mile', name: 'Iron Mile Club', members: 1284, challenge: '100,000 crew steps/member this week', progress: 0.62 },
    { id: 'dawn-patrol', name: 'Dawn Patrol', members: 892, challenge: '5 sunrise sessions before Sunday', progress: 0.4 },
    { id: 'heavy-metal', name: 'Heavy Metal Gym Rats', members: 2311, challenge: '12 live gym sessions this month', progress: 0.75 }
  ];
  const challenges = [
    { name: 'October Forge-a-thon', desc: '250k steps in October', reward: 'Badge + 1.2× pool weight (placeholder)', ends: '2026-10-31' },
    { name: 'Streak Smith', desc: '10 active days in a row', reward: 'Max streak bonus sooner (placeholder)', ends: 'Rolling' }
  ];
  function sessions() {
    const t = Date.now();
    return [
      { id: 's1', title: 'Sunrise 5K Shakeout', type: 'Run', host: '@CoachPlaceholder', start: t - 12 * m, mins: 40, joined: 214, live: true },
      { id: 's2', title: 'Iron Hour: Push Day', type: 'Gym', host: '@AnvilAnnie', start: t - 25 * m, mins: 60, joined: 487, live: true },
      { id: 's3', title: 'Lunch Walk & Talk', type: 'Walk', host: '@BrickRamos', start: t + 50 * m, mins: 30, joined: 96 },
      { id: 's4', title: 'Leg Day Live (no skipping)', type: 'Gym', host: '@SlagSarah', start: t + 5 * h, mins: 45, joined: 302 },
      { id: 's5', title: 'Night Owl 10K', type: 'Run', host: '@TemperedTom', start: t + 9 * h, mins: 60, joined: 158 },
      { id: 's6', title: 'Sunday Long Run Crew', type: 'Run', host: '@QuenchQuinn', start: t + 26 * h, mins: 90, joined: 77 }
    ];
  }
  const chat = ['let’s gooo 🔥', 'pace check: 5:40/km', 'hydrate!!', 'check-in passed ✅', 'form looks clean', 'who else is on a streak?', 'last set, push!', 'mile 2 done'];
  return { athletes, feed, crews, challenges, sessions, chat };
})();

import React, { useEffect, useRef, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, AlarmClock, Bell, BellRing, BrainCircuit, CalendarDays, Check, ChevronRight, CircleHelp, Flame, Gauge, Goal, LayoutDashboard, LogOut, Plus, Send, Sparkles, Target, Trash2, TrendingUp, Trophy, Volume2, Zap } from 'lucide-react';
import { getDailyGitaReflection } from './gitaQuotes';

const API = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '');
const seedHabits = [
  { id: -1, name: 'Read for 20 minutes', category: 'Learning', completed_today: true, streak: 4 },
  { id: -2, name: 'Workout / movement', category: 'Health', completed_today: false, streak: 2 },
  { id: -3, name: 'Plan tomorrow', category: 'Mindset', completed_today: false, streak: 6 },
];
const seedGoals = [
  { id: -1, title: 'Build a consistent study routine', category: 'Learning', progress: 65, target_date: null },
  { id: -2, title: 'Improve physical fitness', category: 'Health', progress: 40, target_date: null },
];

export default function App() {
  const [page, setPage] = useState('Overview');
  const [dashboard, setDashboard] = useState({growth_score: 72, habit_completion: 67, completed_habits: 2, total_habits: 3, goal_average: 53, habits: seedHabits, goals: seedGoals, weekly: [
    {day:'Mon',score:42},{day:'Tue',score:48},{day:'Wed',score:45},{day:'Thu',score:57},{day:'Fri',score:54},{day:'Sat',score:68},{day:'Today',score:72}
  ]});
  const [reminders, setReminders] = useState([]);
  const [backendOnline, setBackendOnline] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [apiToken, setApiToken] = useState(() => sessionStorage.getItem('growth_api_token') || '');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [habitInput, setHabitInput] = useState('');
  const [goalInput, setGoalInput] = useState('');
  const [coachInput, setCoachInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [loadingCoach, setLoadingCoach] = useState(false);
  const [toast, setToast] = useState('');
  const [mood, setMood] = useState('Focused');
  const [journalNote, setJournalNote] = useState('');
  const [journal, setJournal] = useState([]);
  const chatEndRef = useRef(null);
  const [notificationPermission, setNotificationPermission] = useState(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  const audioContextRef = useRef(null);

  async function request(path, options = {}, token = apiToken) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API}${path}`, { ...options, headers });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Request failed' }));
      if (response.status === 401 && token) {
        sessionStorage.removeItem('growth_api_token');
        setApiToken('');
      }
      throw new Error(error.detail || 'Request failed');
    }
    return response.json();
  }

  const refresh = async (token = apiToken) => {
    try {
      const data = await request('/dashboard', {}, token);
      setDashboard(data); setBackendOnline(true);
      const entries = await request('/journal', {}, token).catch(()=>[]);
      setJournal(entries);
      const savedReminders = await request('/reminders', {}, token);
      setReminders(savedReminders);
    } catch {
      setBackendOnline(false);
    }
  };
  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const config = await request('/auth/config', {}, '');
        if (cancelled) return;
        setAuthRequired(config.required);
        if (!config.required || apiToken) await refresh(apiToken);
      } catch {
        if (!cancelled) setBackendOnline(false);
      }
    }
    initialize();
    return () => { cancelled = true; };
  }, []);

  async function login(e) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError('');
    try {
      const data = await request('/login', {
        method: 'POST',
        body: JSON.stringify({ password: loginPassword }),
      }, '');
      sessionStorage.setItem('growth_api_token', data.token);
      setApiToken(data.token);
      setLoginPassword('');
      await refresh(data.token);
    } catch (error) {
      setLoginError(error.message);
    } finally {
      setLoggingIn(false);
    }
  }

  function logout() {
    sessionStorage.removeItem('growth_api_token');
    setApiToken('');
    setBackendOnline(false);
  }

  const notify = (message) => { setToast(message); setTimeout(()=>setToast(''), 2600); };

  async function enableNotifications() {
    if (typeof Notification === 'undefined') {
      notify('This browser does not support desktop notifications.');
      return;
    }
    if (window.AudioContext) {
      audioContextRef.current ||= new window.AudioContext();
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
    }
    const permission = Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;
    setNotificationPermission(permission);
    notify(permission === 'granted'
      ? 'Daily alarm notifications and sound are enabled.'
      : 'Notifications were not allowed. Reminders still appear while this page is open.');
  }

  useEffect(() => {
    function checkReminders() {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      reminders.filter(reminder => reminder.enabled && reminder.time === currentTime).forEach(reminder => {
        const storageKey = `growth-reminder-${reminder.id}-${today}`;
        if (localStorage.getItem(storageKey)) return;
        localStorage.setItem(storageKey, 'sent');
        if (notificationPermission === 'granted') {
          new Notification(reminder.title, {
            body: `Your daily reminder · ${reminder.time}`,
            tag: storageKey,
          });
        }
        const audioContext = audioContextRef.current;
        if (audioContext && audioContext.state === 'running') {
          [0, 0.35].forEach(offset => {
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            oscillator.frequency.value = 880;
            gain.gain.setValueAtTime(0.0001, audioContext.currentTime + offset);
            gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + offset + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + offset + 0.24);
            oscillator.connect(gain);
            gain.connect(audioContext.destination);
            oscillator.start(audioContext.currentTime + offset);
            oscillator.stop(audioContext.currentTime + offset + 0.25);
          });
        }
        notify(`Reminder: ${reminder.title}`);
      });
    }

    checkReminders();
    const timer = window.setInterval(checkReminders, 15000);
    return () => window.clearInterval(timer);
  }, [reminders, notificationPermission]);

  const habits = dashboard.habits || [];
  const goals = dashboard.goals || [];
  const weekly = dashboard.weekly || [];
  const completion = habits.length ? Math.round(habits.filter(h=>h.completed_today).length / habits.length * 100) : 0;
  const score = dashboard.growth_score ?? 0;

  if (authRequired && !apiToken) {
    return <main className="login-screen">
      <form className="login-card" onSubmit={login}>
        <div className="brand-mark login-mark"><Zap size={20}/></div>
        <div className="eyebrow"><span/> PRIVATE WORKSPACE</div>
        <h1>Welcome back.</h1>
        <p>Sign in to access your personal growth space.</p>
        <label htmlFor="app-password">Workspace password</label>
        <input id="app-password" type="password" autoComplete="current-password" minLength={16} value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} required/>
        {loginError&&<div className="login-error" role="alert">{loginError}</div>}
        <button className="primary-btn full-btn" type="submit" disabled={loggingIn}>{loggingIn?'Signing in…':'Sign in'}</button>
      </form>
    </main>;
  }

  async function addHabit(e) {
    e.preventDefault(); if (!habitInput.trim()) return;
    if (backendOnline) {
      try { await request('/habits', {method:'POST', body:JSON.stringify({name:habitInput.trim(),category:'Personal'})}); await refresh(); }
      catch { notify('Could not save habit. Is the backend running?'); return; }
    } else {
      setDashboard(d=>({...d,habits:[...d.habits,{id:Date.now(),name:habitInput.trim(),category:'Personal',completed_today:false,streak:0}]}));
    }
    setHabitInput(''); notify('Habit added to your system.');
  }
  async function toggleHabit(h) {
    if (backendOnline && h.id > 0) {
      try { await request(`/habits/${h.id}/toggle`, {method:'PATCH'}); await refresh(); }
      catch { notify('Could not update habit.'); }
    } else {
      setDashboard(d=>({...d,habits:d.habits.map(x=>x.id===h.id?{...x,completed_today:!x.completed_today,streak:Math.max(0,x.streak+(x.completed_today?-1:1))}:x)}));
    }
  }
  async function deleteHabit(h) {
    if (backendOnline && h.id > 0) await request(`/habits/${h.id}`, {method:'DELETE'}).catch(()=>{});
    setDashboard(d=>({...d,habits:d.habits.filter(x=>x.id!==h.id)})); notify('Habit removed.');
  }
  async function addGoal(e) {
    e.preventDefault(); if (!goalInput.trim()) return;
    if (backendOnline) {
      try { await request('/goals', {method:'POST',body:JSON.stringify({title:goalInput.trim(),category:'Personal'})}); await refresh(); }
      catch { notify('Could not save goal.'); return; }
    } else {
      setDashboard(d=>({...d,goals:[...d.goals,{id:Date.now(),title:goalInput.trim(),category:'Personal',progress:0,target_date:null}]}));
    }
    setGoalInput(''); notify('Goal created.');
  }
  async function changeProgress(g, value) {
    const progress = Number(value);
    if (backendOnline && g.id > 0) {
      try { await request(`/goals/${g.id}`, {method:'PATCH',body:JSON.stringify({progress})}); await refresh(); }
      catch { notify('Could not update goal.'); }
    } else setDashboard(d=>({...d,goals:d.goals.map(x=>x.id===g.id?{...x,progress}:x)}));
  }
  async function askCoach(e) {
    e.preventDefault(); if (!coachInput.trim()) return;
    const message = coachInput.trim();
    const history = chatMessages.slice(-10).map(({role, content}) => ({role, content}));
    setChatMessages(messages => [...messages, {role:'user', content:message}]);
    setCoachInput('');
    setLoadingCoach(true);
    try {
      const data = await request('/coach', {method:'POST',body:JSON.stringify({message, history})});
      setChatMessages(messages => [...messages, {role:'assistant', content:data.reply, mode:data.mode}]);
    } catch {
      setChatMessages(messages => [...messages, {
        role:'assistant',
        content:'I’m having trouble reaching the coach right now. Try again when the backend is available.',
        mode:'Connection unavailable',
      }]);
    } finally {
      setLoadingCoach(false);
    }
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({behavior:'smooth', block:'nearest'});
  }, [chatMessages, loadingCoach]);
  async function saveJournal(e) {
    e.preventDefault(); if (!journalNote.trim()) return;
    if (backendOnline) {
      await request('/journal',{method:'POST',body:JSON.stringify({mood,note:journalNote.trim()})}).catch(()=>{});
      const entries = await request('/journal').catch(()=>journal); setJournal(entries);
    } else setJournal(j=>[{id:Date.now(),mood,note:journalNote.trim(),created_at:new Date().toISOString()},...j]);
    setJournalNote(''); notify('Reflection saved.');
  }

  const nav = [
    {name:'Overview', icon:LayoutDashboard}, {name:'My Habits',icon:Activity},
    {name:'Goals',icon:Target}, {name:'Reminders',icon:AlarmClock}, {name:'AI Coach',icon:BrainCircuit}, {name:'Reflection',icon:Sparkles}
  ];
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Zap size={20}/></div><div><b>ELEVATE</b><span>PERSONAL OS</span></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav>{nav.map(item=><button key={item.name} onClick={()=>setPage(item.name)} className={`nav-item ${page===item.name?'active':''}`}><item.icon size={18}/><span>{item.name}</span>{item.name==='AI Coach'&&<span className="nav-new">AI</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="level-card"><div className="level-top"><span>YOUR JOURNEY</span><Trophy size={15}/></div><div className="level-name">Level 04 <span>• Pathfinder</span></div><div className="xp-track"><div style={{width:`${Math.max(8,score)}%`}}/></div><small>{score*10} / 1000 XP</small></div><div className="profile"><div className="avatar">H</div><div className="profile-copy"><b>Growth Seeker</b><span>Free workspace</span></div><CircleHelp size={17}/></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Workspace <ChevronRight size={14}/> <b>{page}</b></div><div className="top-actions"><span className={`system-status ${backendOnline?'online':''}`}><i/>{backendOnline?'Database connected':'Demo mode'}</span><div className="date-pill"><CalendarDays size={15}/> {new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</div>{authRequired?<button className="signout-btn" onClick={logout}><LogOut size={14}/> Sign out</button>:<div className="avatar small">H</div>}</div></header>
      <div className="content">
        {page==='Overview' && <Overview score={score} habits={habits} goals={goals} weekly={weekly} completion={completion} setPage={setPage} toggleHabit={toggleHabit}/>}
        {page==='My Habits' && <section><PageHeading eyebrow="BUILD YOUR BASELINE" title="Small actions. Big change." subtitle="Consistency turns intentions into identity."/><div className="panel"><div className="panel-heading"><div><h3>Daily habits</h3><p>Track the actions that move you forward.</p></div><span className="counter">{habits.filter(h=>h.completed_today).length}/{habits.length} complete</span></div><form className="inline-form" onSubmit={addHabit}><input value={habitInput} onChange={e=>setHabitInput(e.target.value)} placeholder="Add a habit (e.g. Read 20 minutes)" maxLength="120"/><button className="primary-btn" type="submit"><Plus size={17}/> Add habit</button></form><div className="habit-list">{habits.map(h=><HabitRow key={h.id} habit={h} toggle={toggleHabit} remove={deleteHabit}/>)}</div>{!habits.length&&<Empty title="Your habit list is empty" text="Add one small habit to start building momentum."/>}</div></section>}
        {page==='Goals' && <section><PageHeading eyebrow="DIRECTION & PURPOSE" title="Make progress visible." subtitle="Turn the person you want to become into milestones you can measure."/><div className="panel"><div className="panel-heading"><div><h3>Your goals</h3><p>Move each goal forward one step at a time.</p></div><span className="counter">{goals.length} active goals</span></div><form className="inline-form" onSubmit={addGoal}><input value={goalInput} onChange={e=>setGoalInput(e.target.value)} placeholder="Add a goal (e.g. Finish a portfolio project)" maxLength="180"/><button className="primary-btn" type="submit"><Plus size={17}/> Add goal</button></form><div className="goal-list">{goals.map(g=><GoalRow key={g.id} goal={g} changeProgress={changeProgress}/>)}</div>{!goals.length&&<Empty title="No goals yet" text="Add a goal to give your daily habits a direction."/>}</div></section>}
        {page==='Reminders' && <ReminderManager reminders={reminders} request={request} refresh={refresh} notify={notify} notificationPermission={notificationPermission} enableNotifications={enableNotifications}/>}
        {page==='AI Coach' && <section><PageHeading eyebrow="YOUR PERSONAL STRATEGIST" title="Think clearer. Grow faster." subtitle="Have a back-and-forth conversation and build a practical plan around your goals."/><div className="coach-layout"><div className="coach-card"><div className="coach-orb"><BrainCircuit size={34}/><span/></div><div className="coach-label"><Sparkles size={14}/> ELEVATE INTELLIGENCE</div><h3>Your growth, with a game plan.</h3><p>The coach can follow the conversation and use your habit completion and goal progress to tailor its guidance.</p><div className="prompt-chips"><button onClick={()=>setCoachInput('Help me study consistently for my semester exams')}>Study consistently</button><button onClick={()=>setCoachInput('Build a realistic fitness routine I can follow')}>Build a fitness routine</button><button onClick={()=>setCoachInput('Help me improve focus and stop procrastinating')}>Improve my focus</button></div><button className="text-action clear-chat" onClick={()=>setChatMessages([])}>Clear conversation</button></div><div className="panel coach-chat"><div className="panel-heading"><div><h3><span className="live-dot"/> Growth Coach</h3><p>Personalized conversation</p></div><span className="ai-badge">✦ AI POWERED</span></div><div className="chat-body">{chatMessages.length?chatMessages.map((message,index)=><div className={`chat-message ${message.role}`} key={`${index}-${message.role}`}><div className="mini-avatar">{message.role==='assistant'?<BrainCircuit size={16}/>:<span>H</span>}</div><div><div className="reply-title">{message.role==='assistant'?'Growth Coach':'You'}</div><p className="reply-text">{message.content}</p>{message.mode&&<span className="mode-label">{message.mode}</span>}</div></div>):<div className="coach-empty"><div className="empty-spark"><Sparkles size={22}/></div><b>What would you like to improve?</b><span>Choose a prompt or type your own challenge below.</span></div>}{loadingCoach&&<div className="chat-message assistant"><div className="mini-avatar"><BrainCircuit size={16}/></div><div><div className="reply-title">Growth Coach</div><p className="reply-text">Thinking through your next step…</p></div></div>}<div ref={chatEndRef}/></div><form className="chat-form" onSubmit={askCoach}><textarea value={coachInput} onChange={e=>setCoachInput(e.target.value)} placeholder="Ask a follow-up or share a new goal..." rows="2" maxLength="2000"/><button className="send-btn" disabled={loadingCoach||!coachInput.trim()} aria-label="Send"><Send size={17}/></button></form><div className="privacy-note">Advice is for personal development and is not professional medical or mental-health care. This conversation is not saved.</div></div></div></section>}
        {page==='Reflection' && <section><PageHeading eyebrow="SELF-AWARENESS" title="Pause. Reflect. Reset." subtitle="A short daily reflection helps you notice patterns and learn from your progress."/><div className="reflection-grid"><div className="panel"><div className="panel-heading"><div><h3>Daily check-in</h3><p>How are you showing up today?</p></div><Sparkles size={19} className="muted-icon"/></div><form className="journal-form" onSubmit={saveJournal}><label>Today's mood</label><div className="mood-options">{['Focused','Good','Okay','Low','Energized'].map(m=><button type="button" key={m} className={mood===m?'selected':''} onClick={()=>setMood(m)}>{m}</button>)}</div><label>What went well, and what can improve?</label><textarea value={journalNote} onChange={e=>setJournalNote(e.target.value)} placeholder="One thing I did well today was..." rows="5" maxLength="2000"/><button className="primary-btn full-btn" type="submit">Save reflection <ChevronRight size={16}/></button></form></div><div className="panel"><div className="panel-heading"><div><h3>Recent reflections</h3><p>Your personal learning log.</p></div></div>{journal.length? <div className="journal-list">{journal.map(j=><div className="journal-entry" key={j.id}><div className="journal-entry-top"><b>{j.mood}</b><span>{new Date(j.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span></div><p>{j.note}</p></div>)}</div>:<Empty title="Your story starts here" text="Save your first reflection to begin spotting patterns."/ >}</div></div></section>}
      </div>
      <footer className="footer"><span>© 2026 ELEVATE PERSONAL OS</span><span><i className="footer-dot"/> Built for intentional growth</span></footer>
    </main>
    {toast&&<div className="toast"><Check size={16}/>{toast}</div>}
  </div>;
}

function PageHeading({eyebrow,title,subtitle}) { return <div className="page-heading"><div className="eyebrow"><span/>{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>; }
function ReminderManager({reminders,request,refresh,notify,notificationPermission,enableNotifications}) {
  const [title,setTitle]=useState('');
  const [time,setTime]=useState('09:00');
  const [saving,setSaving]=useState(false);

  async function addReminder(event) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await request('/reminders',{method:'POST',body:JSON.stringify({title:title.trim(),time})});
      await refresh();
      setTitle('');
      notify('Daily reminder set.');
    } catch {
      notify('Could not save reminder. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleReminder(reminder) {
    try {
      await request(`/reminders/${reminder.id}`,{method:'PATCH',body:JSON.stringify({enabled:!reminder.enabled})});
      await refresh();
    } catch {
      notify('Could not update reminder.');
    }
  }

  async function removeReminder(reminder) {
    try {
      await request(`/reminders/${reminder.id}`,{method:'DELETE'});
      await refresh();
      notify('Reminder removed.');
    } catch {
      notify('Could not remove reminder.');
    }
  }

  const permissionText = notificationPermission === 'granted'
    ? 'Notifications enabled'
    : notificationPermission === 'unsupported' ? 'Notifications not supported' : 'Enable alarm notifications';

  return <section>
    <PageHeading eyebrow="MAKE TIME FOR WHAT MATTERS" title="Your daily reminders." subtitle="Set a gentle alarm for the habits you want to make part of your day."/>
    <div className="reminder-layout">
      <div className="panel reminder-panel">
        <div className="panel-heading"><div><h3><AlarmClock size={18}/> Alarm settings</h3><p>Times use this device's local time.</p></div></div>
        <button className="outline-btn notification-enable" type="button" onClick={enableNotifications} disabled={notificationPermission==='unsupported'}>
          {notificationPermission==='granted'?<BellRing size={16}/>:<Bell size={16}/>} {permissionText}
        </button>
        <div className="notification-note"><Volume2 size={14}/> Keep this app open for alarms. Browser notifications and sound also require permission and an initial tap to enable.</div>
        <form className="reminder-form" onSubmit={addReminder}>
          <label htmlFor="reminder-title">Reminder</label>
          <input id="reminder-title" value={title} onChange={event=>setTitle(event.target.value)} placeholder="e.g. Read for 20 minutes" maxLength="120" required/>
          <label htmlFor="reminder-time">Alarm time</label>
          <input id="reminder-time" type="time" value={time} onChange={event=>setTime(event.target.value)} required/>
          <button className="primary-btn full-btn" type="submit" disabled={saving||!title.trim()}><Plus size={16}/>{saving?'Saving…':'Add daily reminder'}</button>
        </form>
      </div>
      <div className="panel reminder-panel">
        <div className="panel-heading"><div><h3>Scheduled alarms</h3><p>{reminders.filter(reminder=>reminder.enabled).length} active · repeat every day</p></div></div>
        {reminders.length?<div className="reminder-list">{reminders.map(reminder=><div className={`reminder-row ${reminder.enabled?'':'reminder-disabled'}`} key={reminder.id}>
          <div className="reminder-time">{reminder.time}</div>
          <div className="reminder-copy"><b>{reminder.title}</b><span>{reminder.enabled?'Daily reminder on':'Paused'}</span></div>
          <button className={`reminder-toggle ${reminder.enabled?'selected':''}`} type="button" onClick={()=>toggleReminder(reminder)} aria-label={`${reminder.enabled?'Pause':'Enable'} ${reminder.title}`} aria-pressed={reminder.enabled}><Bell size={15}/></button>
          <button className="icon-btn danger" type="button" onClick={()=>removeReminder(reminder)} aria-label={`Delete ${reminder.title}`}><Trash2 size={16}/></button>
        </div>)}</div>:<Empty title="No alarms yet" text="Add a reminder for a habit, break, or moment of reflection."/>}
      </div>
    </div>
  </section>;
}

function DailyGitaReflection() {
  const reflection = getDailyGitaReflection();
  return <div className="gita-card">
    <div className="gita-icon"><Sparkles size={19}/></div>
    <div className="gita-copy"><span>BHAGAVAD GITA · DAILY REFLECTION · VERSE {reflection.reference}</span><p>“{reflection.reflection}”</p><small>Daily paraphrase for reflection; not a word-for-word translation.</small></div>
  </div>;
}

function Overview({score,habits,goals,weekly,completion,setPage,toggleHabit}) {
  const done = habits.filter(h=>h.completed_today).length;
  return <section><div className="welcome-row"><div><div className="eyebrow"><span/> YOUR PERSONAL GROWTH SPACE</div><h1>Become 1% better, <em>every day.</em></h1><p>Progress is built in the small things you do consistently.</p></div><button className="outline-btn" onClick={()=>setPage('AI Coach')}><Sparkles size={16}/> Ask your AI coach</button></div>
    <div className="hero-banner"><div className="hero-content"><div className="hero-tag"><Zap size={13}/> YOUR DAILY QUEST</div><h2>Make today <span>count.</span></h2><p>Focus on progress, not perfection. Complete your daily actions to build momentum.</p><button onClick={()=>setPage('My Habits')} className="hero-btn">Continue your journey <ChevronRight size={16}/></button></div><div className="hero-graphic"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="hero-core"><BrainCircuit size={43}/></div><div className="float-chip chip-one"><Flame size={15}/><span><b>Consistency</b><small>is your superpower</small></span></div><div className="float-chip chip-two"><TrendingUp size={15}/><span><b>Keep growing</b><small>one step at a time</small></span></div></div><div className="banner-grid"/></div>
    <div className="section-title"><div><h2>Your growth at a glance</h2><p>Signals from your habits and goals.</p></div><span className="live-label"><i/> LIVE OVERVIEW</span></div>
    <div className="stat-grid"><div className="stat-card score-card"><div className="stat-top"><span>GROWTH SCORE</span><div className="stat-icon violet"><Gauge size={17}/></div></div><div className="score-line"><strong>{score}</strong><span>/100</span><span className="trend"><TrendingUp size={13}/> Building</span></div><div className="meter"><div style={{width:`${score}%`}}/></div><small>Calculated from habits + goal progress</small></div><div className="stat-card"><div className="stat-top"><span>HABITS COMPLETED</span><div className="stat-icon cyan"><Check size={17}/></div></div><div className="big-stat">{done}<span>/{habits.length}</span></div><div className="stat-foot"><span className="accent-cyan">{completion}%</span> completion today</div><div className="mini-bars">{[35,55,43,70,48,82,completion].map((v,i)=><i key={i} style={{height:`${Math.max(10,v)}%`}}/>)}</div></div><div className="stat-card"><div className="stat-top"><span>ACTIVE GOALS</span><div className="stat-icon orange"><Target size={17}/></div></div><div className="big-stat">{goals.length}<span> goals</span></div><div className="stat-foot"><span className="accent-orange">{goals.length?Math.round(goals.reduce((a,g)=>a+g.progress,0)/goals.length):0}%</span> average progress</div><div className="goal-preview">{goals.slice(0,3).map(g=><div key={g.id}><span>{g.title}</span><b>{g.progress}%</b></div>)}</div></div></div>
    <DailyGitaReflection/>
    <div className="dashboard-grid"><div className="panel trend-panel"><div className="panel-heading"><div><h3>Momentum over time</h3><p>Your growth score this week</p></div><span className="chart-legend"><i/> Growth score</span></div><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={weekly} margin={{top:10,right:5,left:-25,bottom:0}}><defs><linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b7cff" stopOpacity={0.28}/><stop offset="95%" stopColor="#8b7cff" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#222b42" strokeDasharray="4 5" vertical={false}/><XAxis dataKey="day" tick={{fill:'#7f8ba8',fontSize:11}} axisLine={false} tickLine={false}/><YAxis domain={[0,100]} tick={{fill:'#7f8ba8',fontSize:11}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:'#10182b',border:'1px solid #2b3652',borderRadius:10,color:'#eef2ff'}}/><Area type="monotone" dataKey="score" stroke="#9485ff" strokeWidth={2.5} fill="url(#growthFill)" activeDot={{r:5,fill:'#a89bff',stroke:'#151a30',strokeWidth:2}}/></AreaChart></ResponsiveContainer></div><div className="chart-bottom"><span><TrendingUp size={15}/> Small steps compound</span><span>Scale: 0–100</span></div></div><div className="panel habits-panel"><div className="panel-heading"><div><h3>Today's habits</h3><p>Win the day, one action at a time.</p></div><button className="text-action" onClick={()=>setPage('My Habits')}>View all <ChevronRight size={14}/></button></div><div className="today-progress"><div className="progress-ring" style={{'--progress':`${completion*3.6}deg`}}><div>{completion}<small>%</small></div></div><div><b>{done===habits.length&&habits.length?'All done!':'Keep your momentum'}</b><span>{done} of {habits.length} completed</span></div></div><div className="compact-habits">{habits.slice(0,4).map(h=><button key={h.id} onClick={()=>toggleHabit(h)} className={`compact-habit ${h.completed_today?'done':''}`}><span className="check-box">{h.completed_today&&<Check size={12}/>}</span><span>{h.name}</span><ChevronRight size={14}/></button>)}</div><button className="add-habit-link" onClick={()=>setPage('My Habits')}><Plus size={14}/> Manage daily habits</button></div></div>
    <div className="bottom-quote"><div className="quote-icon"><Sparkles size={19}/></div><div><b>Remember: growth isn't a straight line.</b><p>Build systems that make your best actions easier to repeat.</p></div><button onClick={()=>setPage('Reflection')}>Reflect today <ChevronRight size={15}/></button></div>
  </section>;
}
function HabitRow({habit,toggle,remove}) {return <div className={`habit-row ${habit.completed_today?'habit-done':''}`}><button className="habit-check" onClick={()=>toggle(habit)}>{habit.completed_today&&<Check size={16}/>}</button><div className="habit-row-copy"><b>{habit.name}</b><span>{habit.category} · <Flame size={12}/> {habit.streak} day streak</span></div><span className={`status-pill ${habit.completed_today?'complete':''}`}>{habit.completed_today?'Completed':'In progress'}</span><button className="icon-btn danger" onClick={()=>remove(habit)} aria-label="Delete habit"><Trash2 size={16}/></button></div>}
function GoalRow({goal,changeProgress}) {return <div className="goal-row"><div className="goal-icon"><Goal size={18}/></div><div className="goal-main"><div className="goal-row-title"><b>{goal.title}</b><span>{goal.progress}%</span></div><div className="goal-progress"><i style={{width:`${goal.progress}%`}}/></div><div className="goal-row-bottom"><span>{goal.category}</span><label>Update progress <input type="range" min="0" max="100" step="5" value={goal.progress} onChange={e=>changeProgress(goal,e.target.value)}/></label></div></div></div>}
function Empty({title,text}) {return <div className="empty-state"><div><Sparkles size={20}/></div><b>{title}</b><span>{text}</span></div>}

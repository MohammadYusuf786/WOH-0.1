(() => {
  'use strict';

  const state = {
    user: null,
    courses: [],
    tutorials: [],
    mediaPosts: [],
    users: [],
    stats: null,
    activeTab: 'overview',
    courseFilter: 'all',
    resourceType: 'course',
    resourceId: null,
    postId: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const initials = name => String(name || 'U').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
  const dateLabel = value => {
    try { return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)); }
    catch { return '—'; }
  };

  async function api(url, options = {}) {
    const config = { credentials: 'same-origin', ...options, headers: { ...(options.headers || {}) } };
    if (config.body && !(config.body instanceof FormData) && typeof config.body !== 'string') {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(config.body);
    }
    const response = await fetch(url, config);
    let payload = {};
    try { payload = await response.json(); } catch { /* empty response */ }
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
    return payload;
  }

  function toast(message, kind = 'success') {
    const region = $('#toastRegion');
    const element = document.createElement('div');
    element.className = `toast${kind === 'error' ? ' error' : ''}`;
    element.textContent = message;
    region.appendChild(element);
    window.setTimeout(() => element.remove(), 3500);
  }

  function setModal(id, open) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.hidden = !open;
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      const firstInput = $('input:not([type="hidden"]),textarea,select', modal);
      if (firstInput) window.setTimeout(() => firstInput.focus(), 50);
    }
  }

  function updateHeader() {
    const container = $('#headerActions');
    if (!state.user) {
      container.innerHTML = '<button class="btn btn-quiet admin-login-btn" data-open-admin-login>Admin Login</button><button class="btn btn-quiet" data-open-auth="login">Sign in</button><button class="btn btn-primary" data-open-auth="signup">Join the hub <span>↗</span></button>';
      return;
    }
    const userName = escapeHTML(state.user.name);
    const adminButton = state.user.role === 'admin' ? '<button class="btn btn-primary" data-open-dashboard>Admin dashboard <span>↗</span></button>' : '';
    container.innerHTML = `${adminButton}<span class="signed-in-label">${userName}</span><button class="btn btn-quiet" data-logout>Sign out</button>`;
  }

  function updateStats() {
    $('#statCourses').textContent = String(state.courses.length).padStart(2, '0');
    $('#statTutorials').textContent = String(state.tutorials.length).padStart(2, '0');
    $('#sideCourseCount').textContent = state.courses.length;
    $('#sideTutorialCount').textContent = state.tutorials.length;
    $('#sidePostCount').textContent = state.mediaPosts.length;
    $('#sideUserCount').textContent = state.stats ? state.stats.users : state.users.length;
  }

  function courseCard(course, index) {
    const symbols = ['⌘', '⌁', '⌬', '⟡', '⌖', '⎔'];
    const enrolled = Boolean(course.enrolled);
    const action = course.file
      ? `<a class="card-action" href="${escapeHTML(course.file.url)}" target="_blank" rel="noopener">Open material ↗</a>`
      : state.user
        ? `<button class="card-action" data-enroll="${escapeHTML(course.id)}" ${enrolled ? 'disabled' : ''}>${enrolled ? '✓ Enrolled' : 'Enroll ↗'}</button>`
        : '<button class="card-action" data-open-auth="login">Sign in to enroll ↗</button>';
    return `<article class="course-card">
      <div class="course-art"><span class="art-symbol">${symbols[index % symbols.length]}</span><span class="art-code">WOH_MODULE_${String(index + 1).padStart(2, '0')}<br>STATUS: READY<br>MODE: LEARN</span><span class="course-number">MODULE / ${String(index + 1).padStart(2, '0')}</span></div>
      <div class="course-card-body"><div class="card-meta"><span class="category-pill">${escapeHTML(course.category)}</span><span class="level-text">${escapeHTML(course.level || 'Beginner')}</span></div>
      <h3>${escapeHTML(course.title)}</h3><p>${escapeHTML(course.description)}</p>
      <div class="card-footer"><span class="card-duration">◷ ${escapeHTML(course.duration || 'Self paced')}</span>${action}</div></div>
    </article>`;
  }

  function renderCourses() {
    const grid = $('#courseGrid');
    const filtered = state.courseFilter === 'all'
      ? state.courses
      : state.courses.filter(course => String(course.category).toLowerCase() === state.courseFilter.toLowerCase());
    grid.innerHTML = filtered.length
      ? filtered.map(courseCard).join('')
      : '<div class="empty-state">No courses in this category yet. Check back soon.</div>';
    updateStats();
  }

  function tutorialCard(tutorial, index) {
    const icons = ['⌁', '⌘', '⌬', '⎔', '⌖', '⟡'];
    const action = tutorial.file
      ? `<a class="card-action" href="${escapeHTML(tutorial.file.url)}" target="_blank" rel="noopener">Open tutorial ↗</a>`
      : '<span class="card-duration">LEARNING NOTE</span>';
    return `<article class="tutorial-card"><div class="tutorial-icon">${icons[index % icons.length]}</div>
      <div class="card-meta"><span class="category-pill">${escapeHTML(tutorial.category)}</span><span class="level-text">TUTORIAL ${String(index + 1).padStart(2, '0')}</span></div>
      <h3>${escapeHTML(tutorial.title)}</h3><p>${escapeHTML(tutorial.description)}</p>
      <div class="card-footer"><span class="card-duration">◷ ${escapeHTML(tutorial.duration || 'Quick read')}</span>${action}</div>
    </article>`;
  }

  function renderTutorials() {
    $('#tutorialGrid').innerHTML = state.tutorials.length
      ? state.tutorials.map(tutorialCard).join('')
      : '<div class="empty-state">Tutorials will appear here when they are published.</div>';
    updateStats();
  }

  function mediaMarkup(post, compact = false) {
    if (!post.media || !post.media.url) return `<div class="post-text-art"><span>WOH / UPDATE</span><b>✦</b></div>`;
    const url = escapeHTML(post.media.url);
    if (post.mediaType === 'video') {
      return `<video class="post-media" controls playsinline preload="metadata" aria-label="${escapeHTML(post.title)}"><source src="${url}" type="${escapeHTML(post.media.mimeType || 'video/mp4')}">Your browser does not support video playback.</video>`;
    }
    return `<img class="post-media" src="${url}" alt="${escapeHTML(post.title)}" loading="lazy">`;
  }

  function renderMediaPosts() {
    const grid = $('#mediaPostGrid');
    if (!grid) return;
    grid.innerHTML = state.mediaPosts.length
      ? state.mediaPosts.map(post => `<article class="media-post-card">
          <div class="media-post-visual">${mediaMarkup(post)}</div>
          <div class="media-post-body"><div class="post-meta"><span class="category-pill">${post.mediaType === 'video' ? 'VIDEO' : post.mediaType === 'image' ? 'PHOTO' : 'UPDATE'}</span><time>${dateLabel(post.createdAt)}</time></div>
            <h3>${escapeHTML(post.title)}</h3><p>${escapeHTML(post.caption)}</p>
          </div>
        </article>`).join('')
      : '<div class="empty-state">No posts yet. New photos, videos, and announcements will appear here.</div>';
    updateStats();
  }

  async function loadPublicContent() {
    const [courseData, tutorialData, postData] = await Promise.all([api('/api/courses'), api('/api/tutorials'), api('/api/posts')]);
    state.courses = courseData.courses || [];
    state.tutorials = tutorialData.tutorials || [];
    state.mediaPosts = postData.posts || [];
    renderCourses();
    renderTutorials();
    renderMediaPosts();
  }

  function setAuthMode(mode) {
    const isSignup = mode === 'signup';
    $('#authTitle').innerHTML = isSignup ? 'Create your <span class="gradient-text">account.</span>' : 'Welcome <span class="gradient-text">back.</span>';
    $('#authIntro').textContent = isSignup ? 'Join the hub and begin building your knowledge.' : 'Sign in to continue your learning journey.';
    $('#nameField').hidden = !isSignup;
    $('input[name="name"]', $('#authForm')).required = isSignup;
    $('input[name="password"]', $('#authForm')).autocomplete = isSignup ? 'new-password' : 'current-password';
    $('#authSubmit').innerHTML = isSignup ? 'Create account <span>↗</span>' : 'Sign in <span>↗</span>';
    $$('.auth-switch button').forEach(button => button.classList.toggle('active', button.dataset.authMode === mode));
    $('#authError').textContent = '';
    $('#authForm').dataset.mode = mode;
  }

  function openAuth(mode = 'login') {
    setAuthMode(mode);
    $('#authForm').reset();
    $('#authForm').dataset.mode = mode;
    setAuthMode(mode);
    setModal('authModal', true);
  }

  function openAdminLogin() {
    openAuth('login');
    $('#authIntro').textContent = 'Administrator sign-in. Use your admin credentials; dashboard access is restricted to administrator accounts.';
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const mode = form.dataset.mode || 'login';
    const payload = Object.fromEntries(new FormData(form).entries());
    const errorBox = $('#authError');
    const submit = $('#authSubmit');
    errorBox.textContent = '';
    submit.disabled = true;
    submit.textContent = mode === 'signup' ? 'Creating account...' : 'Signing in...';
    try {
      const result = await api(`/api/auth/${mode}`, { method: 'POST', body: payload });
      state.user = result.user;
      setModal('authModal', false);
      form.reset();
      updateHeader();
      await loadPublicContent();
      toast(mode === 'signup' ? 'Your account is ready. Welcome to WOH!' : `Welcome back, ${state.user.name}.`);
    } catch (error) {
      errorBox.textContent = error.message;
    } finally {
      submit.disabled = false;
      submit.innerHTML = mode === 'signup' ? 'Create account <span>↗</span>' : 'Sign in <span>↗</span>';
    }
  }

  async function signOut() {
    try { await api('/api/auth/logout', { method: 'POST' }); }
    catch (error) { toast(error.message, 'error'); return; }
    state.user = null;
    if (!$('#dashboardView').hidden) showPublicView();
    updateHeader();
    await loadPublicContent();
    toast('You have signed out.');
  }

  async function enroll(courseId) {
    if (!state.user) return openAuth('login');
    try {
      await api(`/api/courses/${encodeURIComponent(courseId)}/enroll`, { method: 'POST' });
      await loadPublicContent();
      toast('Course added to your learning list.');
    } catch (error) { toast(error.message, 'error'); }
  }

  function showPublicView() {
    $('#dashboardView').hidden = true;
    $('#publicView').hidden = false;
    document.querySelector('.site-footer').hidden = false;
    document.querySelector('.social-section').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function openDashboard() {
    if (!state.user || state.user.role !== 'admin') return toast('Administrator access is required.', 'error');
    $('#publicView').hidden = true;
    $('#dashboardView').hidden = false;
    document.querySelector('.site-footer').hidden = true;
    document.querySelector('.social-section').hidden = true;
    $('#sideAvatar').textContent = initials(state.user.name);
    $('#sideName').textContent = state.user.name;
    await loadDashboard();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function loadDashboard() {
    try {
      const [statsData, usersData] = await Promise.all([api('/api/admin/stats'), api('/api/admin/users')]);
      state.stats = statsData;
      state.users = usersData.users || [];
      updateStats();
      renderDashboardTab();
    } catch (error) {
      toast(error.message, 'error');
      if (error.message.toLowerCase().includes('administrator')) showPublicView();
    }
  }

  function setTab(tab) {
    state.activeTab = tab;
    $$('.dash-nav').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
    renderDashboardTab();
  }

  function renderDashboardTab() {
    const titleMap = { overview: 'Overview', courses: 'Manage courses', tutorials: 'Manage tutorials', posts: 'Manage posts', users: 'Manage users' };
    $('#dashPageTitle').textContent = titleMap[state.activeTab] || 'Overview';
    if (state.activeTab === 'overview') renderOverview();
    if (state.activeTab === 'courses') renderManageResources('course');
    if (state.activeTab === 'tutorials') renderManageResources('tutorial');
    if (state.activeTab === 'posts') renderManagePosts();
    if (state.activeTab === 'users') renderManageUsers();
  }

  function renderOverview() {
    const stats = state.stats || { users: 0, activeUsers: 0, courses: 0, tutorials: 0, posts: 0, enrollments: 0 };
    const recentUsers = state.users.slice(0, 4);
    $('#dashboardContent').innerHTML = `
      <div class="dash-welcome"><div><h2>Welcome to your control center.</h2><p>Manage your learning content and keep your community organized.</p></div><div class="overview-quick-actions"><button class="btn btn-quiet" data-create-post>＋ New post</button><button class="btn btn-primary" data-create-resource="course">＋ Add new course</button></div></div>
      <div class="stat-grid">
        <div class="stat-card"><span>TOTAL USERS</span><strong>${stats.users}</strong><small>${stats.activeUsers} active accounts</small></div>
        <div class="stat-card"><span>PUBLISHED COURSES</span><strong>${stats.courses}</strong><small>Learning paths available</small></div>
        <div class="stat-card"><span>TUTORIALS</span><strong>${stats.tutorials}</strong><small>Quick learning resources</small></div>
        <div class="stat-card"><span>PUBLIC POSTS</span><strong>${stats.posts || 0}</strong><small>Photos, videos & updates</small></div>
        <div class="stat-card"><span>COURSE ENROLLMENTS</span><strong>${stats.enrollments}</strong><small>Across all learner accounts</small></div>
      </div>
      <div class="dash-panel"><div class="dash-panel-head"><div><h3>Recent members</h3><p>Latest accounts created on your platform</p></div><button class="small-btn" data-tab="users">View all users ↗</button></div>
        <div class="activity-list">${recentUsers.length ? recentUsers.map(user => `<div class="activity-row"><div class="user-avatar">${escapeHTML(initials(user.name))}</div><div><b>${escapeHTML(user.name)}</b><small>${escapeHTML(user.email)}</small></div><time>${dateLabel(user.createdAt)}</time></div>`).join('') : '<div class="dashboard-empty">No members yet.</div>'}</div></div>`;
  }

  function renderManageResources(type) {
    const isCourse = type === 'course';
    const items = isCourse ? state.courses : state.tutorials;
    const title = isCourse ? 'Courses' : 'Tutorials';
    const buttonLabel = isCourse ? '＋ Upload course' : '＋ Upload tutorial';
    $('#dashboardContent').innerHTML = `<div class="manage-toolbar"><input id="resourceSearch" type="search" placeholder="Search ${title.toLowerCase()}..." aria-label="Search ${title}"><button class="btn btn-primary" data-create-resource="${type}">${buttonLabel}</button></div><div class="manage-grid" id="manageResourceGrid">${items.length ? items.map(item => manageResourceCard(item, type)).join('') : '<div class="dashboard-empty">Nothing published yet. Add your first resource.</div>'}</div>`;
    const search = $('#resourceSearch');
    search.addEventListener('input', () => {
      const query = search.value.trim().toLowerCase();
      const filtered = items.filter(item => `${item.title} ${item.category} ${item.description}`.toLowerCase().includes(query));
      $('#manageResourceGrid').innerHTML = filtered.length ? filtered.map(item => manageResourceCard(item, type)).join('') : '<div class="dashboard-empty">No matching resources.</div>';
    });
  }

  function manageResourceCard(item, type) {
    const fileLabel = item.file ? `<div class="resource-file">↳ ${escapeHTML(item.file.name)}</div>` : '<div class="resource-file">↳ No attachment added</div>';
    return `<article class="manage-card"><div class="manage-card-top"><div><div class="card-meta"><span class="category-pill">${escapeHTML(item.category)}</span><span class="level-text">${escapeHTML(type === 'course' ? item.level || 'Beginner' : item.duration || 'Tutorial')}</span></div><h3>${escapeHTML(item.title)}</h3></div><span class="level-text">${dateLabel(item.createdAt)}</span></div><p>${escapeHTML(item.description)}</p>${fileLabel}<div class="manage-actions"><button class="small-btn" data-edit-resource="${escapeHTML(item.id)}" data-resource-type="${type}">Edit</button><button class="small-btn danger" data-delete-resource="${escapeHTML(item.id)}" data-resource-type="${type}">Delete</button>${item.file ? `<a class="small-btn" href="${escapeHTML(item.file.url)}" target="_blank" rel="noopener">Open file ↗</a>` : ''}</div></article>`;
  }

  function renderManagePosts() {
    const posts = state.mediaPosts;
    $('#dashboardContent').innerHTML = `<div class="manage-toolbar"><div class="manage-intro"><b>Public media feed</b><small>Anything you publish here is visible to all website visitors.</small></div><button class="btn btn-primary" data-create-post>＋ Create post</button></div>
      <div class="manage-grid media-manage-grid" id="managePostGrid">${posts.length ? posts.map(managePostCard).join('') : '<div class="dashboard-empty">No posts yet. Create your first photo, video, or announcement.</div>'}</div>`;
  }

  function managePostCard(post) {
    return `<article class="manage-card media-manage-card"><div class="media-manage-preview">${mediaMarkup(post, true)}</div>
      <div class="manage-card-top"><div><div class="card-meta"><span class="category-pill">${String(post.mediaType || 'text').toUpperCase()}</span></div><h3>${escapeHTML(post.title)}</h3></div><span class="level-text">${dateLabel(post.createdAt)}</span></div>
      <p>${escapeHTML(post.caption)}</p><div class="resource-file">${post.media ? `↳ ${escapeHTML(post.media.name)}` : '↳ Text-only announcement'}</div>
      <div class="manage-actions"><button class="small-btn" data-edit-post="${escapeHTML(post.id)}">Edit</button><button class="small-btn danger" data-delete-post="${escapeHTML(post.id)}">Delete</button></div></article>`;
  }

  function openPostEditor(post = null) {
    state.postId = post ? post.id : null;
    const form = $('#postForm');
    form.reset();
    form.elements.postId.value = post ? post.id : '';
    form.elements.title.value = post ? post.title : '';
    form.elements.caption.value = post ? post.caption : '';
    $('#postModalTitle').innerHTML = post ? 'Edit <span class="gradient-text">post.</span>' : 'Create <span class="gradient-text">post.</span>';
    $('.modal-intro', $('#postModal')).textContent = post ? 'Update the caption or replace the attached media.' : 'Share a photo, video, or text update with every visitor.';
    $('#postSubmit').innerHTML = post ? 'Save changes <span>↗</span>' : 'Publish post <span>↗</span>';
    $('#postFileChosen').textContent = post && post.media ? `Current: ${post.media.name} · Choose a new file to replace it` : 'Optional · text-only updates are also supported';
    $('#postError').textContent = '';
    setModal('postModal', true);
  }

  async function handlePostSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const id = state.postId;
    formData.delete('postId');
    const endpoint = id ? `/api/admin/posts/${encodeURIComponent(id)}` : '/api/admin/posts';
    const submit = $('#postSubmit');
    submit.disabled = true;
    submit.textContent = id ? 'Saving changes...' : 'Publishing...';
    $('#postError').textContent = '';
    try {
      await api(endpoint, { method: id ? 'PATCH' : 'POST', body: formData });
      setModal('postModal', false);
      await loadPublicContent();
      await loadDashboard();
      toast(id ? 'Post updated. Visitors can see the changes.' : 'Post published. Visitors can see it now.');
    } catch (error) {
      $('#postError').textContent = error.message;
    } finally {
      submit.disabled = false;
      submit.innerHTML = id ? 'Save changes <span>↗</span>' : 'Publish post <span>↗</span>';
    }
  }

  async function deletePost(id) {
    const post = state.mediaPosts.find(item => item.id === id);
    if (!post || !window.confirm(`Delete “${post.title}”? Visitors will no longer see this post.`)) return;
    try {
      await api(`/api/admin/posts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadPublicContent();
      await loadDashboard();
      toast('Post deleted.');
    } catch (error) { toast(error.message, 'error'); }
  }

  function renderManageUsers() {
    const rows = state.users.map(user => `<tr>
      <td><div class="person-cell"><div class="user-avatar">${escapeHTML(initials(user.name))}</div><span><b>${escapeHTML(user.name)}</b><small>${escapeHTML(user.email)}</small></span></div></td>
      <td><select class="role-select" data-user-role="${escapeHTML(user.id)}" ${user.isSeedAdmin || user.id === state.user.id ? 'disabled' : ''}><option value="student" ${user.role === 'student' ? 'selected' : ''}>Student</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option></select></td>
      <td><span class="status-pill ${user.status === 'suspended' ? 'suspended' : ''}">${escapeHTML(user.status)}</span></td>
      <td><select class="status-select" data-user-status="${escapeHTML(user.id)}" ${user.id === state.user.id ? 'disabled' : ''}><option value="active" ${user.status === 'active' ? 'selected' : ''}>Active</option><option value="suspended" ${user.status === 'suspended' ? 'selected' : ''}>Suspended</option></select></td>
      <td>${dateLabel(user.createdAt)}</td>
      <td>${user.isSeedAdmin ? '<span class="level-text">Protected</span>' : `<button class="small-btn danger" data-delete-user="${escapeHTML(user.id)}">Remove</button>`}</td>
    </tr>`).join('');
    $('#dashboardContent').innerHTML = `<div class="dash-panel"><div class="dash-panel-head"><div><h3>Community members</h3><p>Update account roles, suspend access, or remove an account.</p></div><span class="category-pill">${state.users.length} ACCOUNTS</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>MEMBER</th><th>ROLE</th><th>STATUS</th><th>CHANGE STATUS</th><th>JOINED</th><th>ACTION</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No members yet.</td></tr>'}</tbody></table></div></div><p class="user-management-note">The primary demo administrator is protected from deletion and role changes.</p>`;
  }

  function openResourceEditor(type, item = null) {
    state.resourceType = type;
    state.resourceId = item ? item.id : null;
    const form = $('#resourceForm');
    form.reset();
    form.elements.resourceType.value = type;
    form.elements.resourceId.value = item ? item.id : '';
    form.elements.title.value = item ? item.title : '';
    form.elements.description.value = item ? item.description : '';
    form.elements.category.value = item ? item.category : (type === 'course' ? 'Cybersecurity' : 'Tutorial');
    form.elements.duration.value = item ? item.duration || '' : '';
    form.elements.level.value = item ? item.level || 'Beginner' : 'Beginner';
    $('#levelField').hidden = type !== 'course';
    $('#resourceModalTitle').innerHTML = item
      ? `Edit <span class="gradient-text">${type}.</span>`
      : `Add <span class="gradient-text">${type}.</span>`;
    $('.modal-intro', $('#resourceModal')).textContent = item ? 'Update this resource and save your changes.' : 'Publish a learning resource to your public website.';
    $('#resourceSubmit').innerHTML = item ? 'Save changes <span>↗</span>' : 'Publish resource <span>↗</span>';
    $('#resourceError').textContent = '';
    $('#fileChosen').textContent = item && item.file ? `Current file: ${item.file.name} · Choose a new file to replace it` : 'No file selected';
    setModal('resourceModal', true);
  }

  async function handleResourceSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const type = state.resourceType;
    const id = state.resourceId;
    const collection = type === 'course' ? 'courses' : 'tutorials';
    const endpoint = id ? `/api/admin/${collection}/${encodeURIComponent(id)}` : `/api/admin/${collection}`;
    formData.delete('resourceType');
    formData.delete('resourceId');
    const submit = $('#resourceSubmit');
    submit.disabled = true;
    submit.textContent = id ? 'Saving changes...' : 'Publishing...';
    $('#resourceError').textContent = '';
    try {
      await api(endpoint, { method: id ? 'PATCH' : 'POST', body: formData });
      setModal('resourceModal', false);
      await loadPublicContent();
      await loadDashboard();
      toast(id ? `${type} updated successfully.` : `${type} published successfully.`);
    } catch (error) {
      $('#resourceError').textContent = error.message;
    } finally {
      submit.disabled = false;
      submit.innerHTML = id ? 'Save changes <span>↗</span>' : 'Publish resource <span>↗</span>';
    }
  }

  async function deleteResource(id, type) {
    const label = type === 'course' ? 'course' : 'tutorial';
    if (!window.confirm(`Delete this ${label}? Its uploaded attachment will also be removed.`)) return;
    const collection = type === 'course' ? 'courses' : 'tutorials';
    try {
      await api(`/api/admin/${collection}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadPublicContent();
      await loadDashboard();
      toast(`${label[0].toUpperCase()}${label.slice(1)} deleted.`);
    } catch (error) { toast(error.message, 'error'); }
  }

  async function updateUser(id, changes) {
    try {
      await api(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: changes });
      await loadDashboard();
      toast('User account updated.');
    } catch (error) {
      toast(error.message, 'error');
      await loadDashboard();
    }
  }

  async function deleteUser(id) {
    const user = state.users.find(item => item.id === id);
    if (!user || !window.confirm(`Remove ${user.name}'s account? This action cannot be undone.`)) return;
    try {
      await api(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadDashboard();
      toast('User account removed.');
    } catch (error) { toast(error.message, 'error'); }
  }

  document.addEventListener('click', async event => {
    const target = event.target.closest('button,a');
    if (!target) return;
    if (target.matches('[data-open-admin-login]')) { event.preventDefault(); openAdminLogin(); }
    if (target.matches('[data-open-auth]')) { event.preventDefault(); openAuth(target.dataset.openAuth); }
    if (target.matches('[data-auth-mode]')) setAuthMode(target.dataset.authMode);
    if (target.matches('[data-close-modal]')) setModal(target.closest('.modal-backdrop').id, false);
    if (target.matches('[data-open-dashboard]')) openDashboard();
    if (target.matches('[data-logout],#sidebarLogout')) signOut();
    if (target.matches('[data-tab]')) setTab(target.dataset.tab);
    if (target.matches('[data-create-resource]')) openResourceEditor(target.dataset.createResource);
    if (target.matches('[data-create-post]')) openPostEditor();
    if (target.matches('[data-edit-post]')) { const post = state.mediaPosts.find(item => item.id === target.dataset.editPost); if (post) openPostEditor(post); }
    if (target.matches('[data-delete-post]')) deletePost(target.dataset.deletePost);
    if (target.matches('[data-edit-resource]')) {
      const type = target.dataset.resourceType;
      const list = type === 'course' ? state.courses : state.tutorials;
      const item = list.find(resource => resource.id === target.dataset.editResource);
      if (item) openResourceEditor(type, item);
    }
    if (target.matches('[data-delete-resource]')) deleteResource(target.dataset.deleteResource, target.dataset.resourceType);
    if (target.matches('[data-delete-user]')) deleteUser(target.dataset.deleteUser);
    if (target.matches('[data-enroll]')) enroll(target.dataset.enroll);
    if (target.matches('[data-filter]')) {
      state.courseFilter = target.dataset.filter;
      $$('#courseFilters .filter-chip').forEach(button => button.classList.toggle('active', button === target));
      renderCourses();
    }
    if (target.matches('#mobileMenuBtn')) $('#mainNav')?.classList.toggle('open');
    if (target.matches('#backToSite')) { event.preventDefault(); showPublicView(); }
  });

  document.addEventListener('change', event => {
    if (event.target.matches('[data-user-role]')) updateUser(event.target.dataset.userRole, { role: event.target.value });
    if (event.target.matches('[data-user-status]')) updateUser(event.target.dataset.userStatus, { status: event.target.value });
    if (event.target.matches('input[name="attachment"]')) {
      const file = event.target.files && event.target.files[0];
      const label = event.target.closest('#postForm') ? $('#postFileChosen') : $('#fileChosen');
      if (label) label.textContent = file ? `${file.name} · ${(file.size / (1024 * 1024)).toFixed(1)} MB` : (event.target.closest('#postForm') ? 'Optional · text-only updates are also supported' : 'No file selected');
    }
  });

  $('#authForm').addEventListener('submit', handleAuthSubmit);
  $('#resourceForm').addEventListener('submit', handleResourceSubmit);
  $('#postForm').addEventListener('submit', handlePostSubmit);
  $('#currentYear').textContent = new Date().getFullYear();

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!$('#authModal').hidden) setModal('authModal', false);
      if (!$('#resourceModal').hidden) setModal('resourceModal', false);
      if (!$('#postModal').hidden) setModal('postModal', false);
    }
  });

  async function init() {
    try {
      const auth = await api('/api/auth/me');
      state.user = auth.user;
      updateHeader();
      await loadPublicContent();
      if (state.user && state.user.role === 'admin') updateStats();
    } catch (error) {
      console.error(error);
      toast('Could not connect to the server. Please refresh the page.', 'error');
    }
  }

  // Keep the public feed fresh for visitors who leave the site open.
  window.setInterval(async () => {
    if (document.visibilityState !== 'visible' || !$('#dashboardView').hidden) return;
    try {
      const result = await api('/api/posts');
      const freshPosts = result.posts || [];
      if (JSON.stringify(freshPosts) !== JSON.stringify(state.mediaPosts)) {
        state.mediaPosts = freshPosts;
        renderMediaPosts();
      }
    } catch { /* A temporary feed refresh failure should not interrupt browsing. */ }
  }, 45000);

  init();
})();

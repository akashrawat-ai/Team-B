let currentToken = null;
let currentUser = null;

// Check for existing token
if (localStorage.getItem('adminToken')) {
    currentToken = localStorage.getItem('adminToken');
    showAdminPage();
}

// Admin login
document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('adminEmail').value;
    const password = document.getElementById('adminPassword').value;
    
    try {
        const response = await fetch('http://localhost:5000/api/signin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.role === 'admin') {
            currentToken = data.token;
            currentUser = data;
            localStorage.setItem('adminToken', currentToken);
            showAdminPage();
            loadDashboardData();
        } else {
            alert('Admin access required. Please use admin credentials.');
        }
    } catch (error) {
        alert('Login failed. Make sure the server is running on http://localhost:5000');
    }
});

function showAdminPage() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('adminPage').style.display = 'block';
}

function logout() {
    currentToken = null;
    currentUser = null;
    localStorage.removeItem('adminToken');
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('adminPage').style.display = 'none';
}

// Navigation
function showSection(section) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(sec => {
        sec.classList.remove('active');
    });
    
    // Remove active class from all nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected section and activate button
    document.getElementById(section).classList.add('active');
    event.target.classList.add('active');
    
    // Load section data
    loadSectionData(section);
}

// Load data for sections
function loadSectionData(section) {
    switch(section) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'users':
            loadUsers();
            break;
        case 'feedback':
            loadFeedback();
            break;
        case 'knowledge':
            loadKnowledgeBase();
            break;
    }
}

// Dashboard data
async function loadDashboardData() {
    try {
        const response = await fetch('http://localhost:5000/api/admin/dashboard/stats', {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to fetch dashboard stats');
        
        const data = await response.json();
        
        // Update stat cards
        document.getElementById('totalUsers').textContent = data.total_users.toLocaleString();
        document.getElementById('activeUsers').textContent = data.active_users.toLocaleString();
        document.getElementById('totalQueries').textContent = data.total_queries.toLocaleString();
        document.getElementById('healthTopics').textContent = data.health_topics.toLocaleString();
        document.getElementById('positiveFeedback').textContent = `${data.positive_feedback_percentage}%`;
        document.getElementById('totalFeedback').textContent = data.total_feedback_count.toLocaleString();
        
        // Create charts
        createCharts(data);
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        alert('Failed to load dashboard data');
    }
}

// Chart creation
function createCharts(data) {
    createQueryTrendsChart(data.query_trends);
    createIntentsChart(data.top_intents);
    createFeedbackChart(data.positive_feedback_percentage, data.total_feedback_count - data.positive_feedback_count);
}

function createQueryTrendsChart(trends) {
    const ctx = document.getElementById('queryTrendsChart').getContext('2d');
    const dates = trends.map(t => new Date(t.date).toLocaleDateString());
    const counts = trends.map(t => t.count);
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'Daily Queries',
                data: counts,
                borderColor: '#5dd9c1',
                backgroundColor: 'rgba(93, 217, 193, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#b0c4de' }
                },
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#b0c4de' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#b0c4de' }
                }
            }
        }
    });
}

function createIntentsChart(intents) {
    const ctx = document.getElementById('intentsChart').getContext('2d');
    const labels = intents.map(i => i.intent);
    const counts = intents.map(i => i.count);
    
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: counts,
                backgroundColor: ['#5dd9c1', '#3bc4a8', '#2aa893', '#1a8c7d', '#0f7067']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#b0c4de' }
                }
            }
        }
    });
}

function createFeedbackChart(positive, negative) {
    const ctx = document.getElementById('feedbackChart').getContext('2d');
    
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Positive', 'Negative'],
            datasets: [{
                data: [positive, negative],
                backgroundColor: ['#5dd9c1', '#ff6b6b']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#b0c4de' }
                }
            }
        }
    });
}

// Load users
async function loadUsers() {
    try {
        const response = await fetch('http://localhost:5000/api/admin/users', {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to fetch users');
        
        const data = await response.json();
        const table = document.getElementById('usersTable');
        table.innerHTML = '';
        
        data.users.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.username}</td>
                <td>${user.email}</td>
                <td>${user.age_group || 'Not set'}</td>
                <td>${user.preferred_language.toUpperCase()}</td>
                <td>${user.conversations_count}</td>
                <td>${new Date(user.created_at).toLocaleDateString()}</td>
                <td>${user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}</td>
            `;
            table.appendChild(row);
        });
        
    } catch (error) {
        document.getElementById('usersTable').innerHTML = '<tr><td colspan="7" style="text-align: center; color: #ff6b6b;">Failed to load users</td></tr>';
    }
}

// Load feedback
async function loadFeedback() {
    try {
        const response = await fetch('http://localhost:5000/api/admin/feedback', {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to fetch feedback');
        
        const data = await response.json();
        const table = document.getElementById('feedbackTable');
        table.innerHTML = '';
        
        if (data.feedback.length === 0) {
            table.innerHTML = '<tr><td colspan="4" style="text-align: center;">No feedback yet</td></tr>';
            return;
        }
        
        data.feedback.forEach(fb => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${fb.user_email}</td>
                <td>${fb.rating === 'positive' ? '👍 Positive' : '👎 Negative'}</td>
                <td>${fb.comment || 'No comment'}</td>
                <td>${new Date(fb.created_at).toLocaleString()}</td>
            `;
            table.appendChild(row);
        });
        
    } catch (error) {
        document.getElementById('feedbackTable').innerHTML = '<tr><td colspan="4" style="text-align: center; color: #ff6b6b;">Failed to load feedback</td></tr>';
    }
}

// Load knowledge base
async function loadKnowledgeBase() {
    try {
        const response = await fetch('http://localhost:5000/api/admin/knowledge-base', {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to fetch knowledge base');
        
        const data = await response.json();
        const table = document.getElementById('knowledgeTable');
        table.innerHTML = '';
        
        data.knowledge_base.forEach(entry => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${entry.category}</td>
                <td>${entry.title}</td>
                <td>${entry.content.substring(0, 100)}...</td>
                <td>${entry.language.toUpperCase()}</td>
                <td>${entry.is_active ? '✅ Active' : '❌ Inactive'}</td>
            `;
            table.appendChild(row);
        });
        
    } catch (error) {
        document.getElementById('knowledgeTable').innerHTML = '<tr><td colspan="5" style="text-align: center; color: #ff6b6b;">Failed to load knowledge base</td></tr>';
    }
}

function addKnowledgeEntry() {
    const category = prompt('Enter category:');
    const title = prompt('Enter title:');
    const content = prompt('Enter content:');
    
    if (category && title && content) {
        fetch('http://localhost:5000/api/admin/knowledge-base', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({
                category: category,
                title: title,
                content: content,
                language: 'en'
            })
        })
        .then(response => response.json())
        .then(data => {
            alert('Knowledge base entry added!');
            loadKnowledgeBase();
        })
        .catch(error => {
            alert('Failed to add entry');
        });
    }
}

// Auto-refresh dashboard every 30 seconds
setInterval(() => {
    if (document.getElementById('dashboard').classList.contains('active')) {
        loadDashboardData();
    }
}, 30000);// admin.js - Complete real data integration
currentToken = localStorage.getItem('adminToken') || localStorage.getItem('token');
let currentSection = 'dashboard';
const API_BASE = 'http://localhost:5000/api';

// Check authentication
if (!currentToken) {
    window.location.href = '/';
}

const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${currentToken}`
});

// Show section
function showSection(section) {
    document.querySelectorAll('.content-section').forEach(sec => {
        sec.classList.remove('active');
    });
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(section).classList.add('active');
    event.target.classList.add('active');
    
    currentSection = section;
    loadSectionData(section);
}

// Load data for specific section
function loadSectionData(section) {
    switch(section) {
        case 'dashboard':
            loadDashboardStats();
            break;
        case 'knowledge':
            loadKnowledgeBase();
            break;
        case 'users':
            loadUsers();
            break;
        case 'queries':
            loadQueries();
            break;
        case 'feedback':
            loadFeedback();
            break;
        case 'activities':
            loadActivities();
            break;
    }
}

// Load dashboard statistics with real data
async function loadDashboardStats() {
    try {
        showLoading('dashboard');
        
        const response = await fetch(`${API_BASE}/admin/dashboard/stats`, {
            headers: getHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to fetch stats');
        
        const data = await response.json();
        
        // Update stat cards with real data
        animateCounter('totalUsers', data.total_users);
        animateCounter('totalQueries', data.total_queries);
        animateCounter('healthTopics', data.health_topics);
        document.getElementById('positiveFeedback').textContent = `${data.positive_feedback_percentage}%`;
        
        // Update subtexts
        document.getElementById('activeUsers').textContent = `${data.active_users} active`;
        document.getElementById('totalConversations').textContent = `${data.total_conversations} conversations`;
        document.getElementById('totalFeedback').textContent = `${data.positive_feedback_percentage > 0 ? 'With ratings' : 'No ratings yet'}`;
        
        // Create charts with real data
        createQueryTrendsChart(data.query_trends);
        createIntentsChart(data.top_intents);
        
        // Load recent activities
        loadRecentActivity(data.recent_activities);
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showError('Failed to load dashboard data');
    }
}

// Load knowledge base with real data
async function loadKnowledgeBase() {
    try {
        showLoading('knowledge');
        
        const response = await fetch(`${API_BASE}/admin/knowledge-base`, {
            headers: getHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to fetch knowledge base');
        
        const data = await response.json();
        const table = document.getElementById('knowledgeTable');
        table.innerHTML = '';
        
        data.knowledge_base.forEach(entry => {
            const row = document.createElement('tr');
            const contentPreview = entry.content.length > 100 ? 
                entry.content.substring(0, 100) + '...' : entry.content;
            const createdDate = new Date(entry.created_at).toLocaleDateString();
            
            row.innerHTML = `
                <td>${entry.category.replace('_', ' ').toUpperCase()}</td>
                <td>${entry.title}</td>
                <td title="${entry.content}">${contentPreview}</td>
                <td>${entry.language.toUpperCase()}</td>
                <td><span class="status-badge ${entry.is_active ? 'status-active' : 'status-inactive'}">
                    ${entry.is_active ? 'Active' : 'Inactive'}
                </span></td>
                <td>${entry.created_by || 'System'}</td>
                <td>
                    <button class="action-btn btn-edit" onclick="editKnowledgeEntry(${entry.id})" title="Edit">✏️</button>
                    <button class="action-btn btn-toggle" onclick="toggleKnowledgeEntry(${entry.id}, ${!entry.is_active})" title="${entry.is_active ? 'Deactivate' : 'Activate'}">
                        ${entry.is_active ? '⏸️' : '▶️'}
                    </button>
                    <button class="action-btn btn-delete" onclick="deleteKnowledgeEntry(${entry.id})" title="Delete">🗑️</button>
                </td>
            `;
            table.appendChild(row);
        });
        
    } catch (error) {
        console.error('Error loading knowledge base:', error);
        showError('Failed to load knowledge base');
    }
}

// Load users with real data
async function loadUsers() {
    try {
        showLoading('users');
        
        const response = await fetch(`${API_BASE}/admin/users`, {
            headers: getHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to fetch users');
        
        const data = await response.json();
        const table = document.getElementById('usersTable');
        table.innerHTML = '';
        
        document.getElementById('usersCount').textContent = `Total: ${data.users.length} users`;
        
        data.users.forEach(user => {
            const row = document.createElement('tr');
            const joinDate = new Date(user.created_at).toLocaleDateString();
            const lastLogin = user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never';
            
            row.innerHTML = `
                <td>${user.username}</td>
                <td>${user.email}</td>
                <td>${user.age_group || 'Not set'}</td>
                <td>${user.preferred_language?.toUpperCase() || 'EN'}</td>
                <td>${user.conversations_count}</td>
                <td>${user.messages_count}</td>
                <td><span class="role-badge ${user.role}">${user.role}</span></td>
                <td><span class="status-badge ${user.is_active ? 'status-active' : 'status-inactive'}">
                    ${user.is_active ? 'Active' : 'Inactive'}
                </span></td>
                <td>${lastLogin}</td>
                <td>
                    <button class="action-btn btn-edit" onclick="editUserRole(${user.id}, '${user.role}')" title="Edit Role">👑</button>
                    <button class="action-btn btn-toggle" onclick="toggleUserStatus(${user.id}, ${!user.is_active})" title="${user.is_active ? 'Deactivate' : 'Activate'}">
                        ${user.is_active ? '⏸️' : '▶️'}
                    </button>
                </td>
            `;
            table.appendChild(row);
        });
        
    } catch (error) {
        console.error('Error loading users:', error);
        showError('Failed to load users');
    }
}

// Load queries with real data
async function loadQueries() {
    try {
        showLoading('queries');
        
        const response = await fetch(`${API_BASE}/admin/queries`, {
            headers: getHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to fetch queries');
        
        const data = await response.json();
        const table = document.getElementById('queriesTable');
        table.innerHTML = '';
        
        document.getElementById('queriesCount').textContent = `Showing ${data.queries.length} of ${data.total} queries`;
        
        data.queries.forEach(query => {
            const row = document.createElement('tr');
            const timestamp = new Date(query.timestamp).toLocaleString();
            const confidence = query.confidence ? `${(query.confidence * 100).toFixed(1)}%` : 'N/A';
            const messagePreview = query.message.length > 50 ? 
                query.message.substring(0, 50) + '...' : query.message;
            
            row.innerHTML = `
                <td>${query.user_email}</td>
                <td title="${query.message}">${messagePreview}</td>
                <td>${query.intent || 'general'}</td>
                <td>${confidence}</td>
                <td>${timestamp}</td>
                <td>#${query.conversation_id}</td>
            `;
            table.appendChild(row);
        });
        
    } catch (error) {
        console.error('Error loading queries:', error);
        showError('Failed to load queries');
    }
}

// Load feedback with real data
async function loadFeedback() {
    try {
        showLoading('feedback');
        
        const response = await fetch(`${API_BASE}/admin/feedback`, {
            headers: getHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to fetch feedback');
        
        const data = await response.json();
        const table = document.getElementById('feedbackTable');
        table.innerHTML = '';
        
        // Calculate feedback stats
        const total = data.feedback.length;
        const positive = data.feedback.filter(f => f.rating === 'positive').length;
        const positivePercent = total > 0 ? Math.round((positive / total) * 100) : 0;
        
        document.getElementById('feedbackInfo').textContent = 
            `${positivePercent}% Positive (${positive}/${total} feedbacks)`;
        
        data.feedback.forEach(fb => {
            const row = document.createElement('tr');
            const date = new Date(fb.created_at).toLocaleDateString();
            const messagePreview = fb.message.length > 50 ? 
                fb.message.substring(0, 50) + '...' : fb.message;
            
            row.innerHTML = `
                <td>${fb.user_email}</td>
                <td title="${fb.message}">${messagePreview}</td>
                <td class="${fb.rating === 'positive' ? 'rating-positive' : 'rating-negative'}">
                    ${fb.rating === 'positive' ? '👍 Positive' : '👎 Negative'}
                </td>
                <td>${fb.comment || 'No comment'}</td>
                <td>${date}</td>
            `;
            table.appendChild(row);
        });
        
    } catch (error) {
        console.error('Error loading feedback:', error);
        showError('Failed to load feedback');
    }
}

// Load activities with real data
async function loadActivities() {
    try {
        showLoading('activities');
        
        const response = await fetch(`${API_BASE}/admin/activities`, {
            headers: getHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to fetch activities');
        
        const data = await response.json();
        const table = document.getElementById('activitiesTable');
        table.innerHTML = '';
        
        document.getElementById('activitiesCount').textContent = `Showing ${data.activities.length} activities`;
        
        data.activities.forEach(activity => {
            const row = document.createElement('tr');
            const timestamp = new Date(activity.created_at).toLocaleString();
            const descriptionPreview = activity.description.length > 50 ? 
                activity.description.substring(0, 50) + '...' : activity.description;
            
            row.innerHTML = `
                <td>${activity.admin_name}</td>
                <td>${activity.action}</td>
                <td title="${activity.description}">${descriptionPreview}</td>
                <td>${activity.ip_address || 'N/A'}</td>
                <td>${timestamp}</td>
            `;
            table.appendChild(row);
        });
        
    } catch (error) {
        console.error('Error loading activities:', error);
        showError('Failed to load activities');
    }
}

// Load recent activity for dashboard
function loadRecentActivity(activities) {
    const table = document.getElementById('recentActivityTable');
    const adminTable = document.getElementById('adminActivitiesTable');
    
    table.innerHTML = '';
    adminTable.innerHTML = '';
    
    // Show user activities (recent queries)
    if (activities && activities.length > 0) {
        activities.slice(0, 5).forEach(activity => {
            const row = document.createElement('tr');
            const timeAgo = getTimeAgo(new Date(activity.timestamp));
            
            row.innerHTML = `
                <td>${activity.admin_name}</td>
                <td>${activity.action}</td>
                <td>${timeAgo}</td>
            `;
            adminTable.appendChild(row);
        });
    }
    
    // Load recent user queries for activity table
    loadRecentQueries();
}

async function loadRecentQueries() {
    try {
        const response = await fetch(`${API_BASE}/admin/queries?per_page=5`, {
            headers: getHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            const table = document.getElementById('recentActivityTable');
            
            data.queries.forEach(query => {
                const row = document.createElement('tr');
                const timeAgo = getTimeAgo(new Date(query.timestamp));
                const messagePreview = query.message.length > 30 ? 
                    query.message.substring(0, 30) + '...' : query.message;
                
                row.innerHTML = `
                    <td>${query.user_email}</td>
                    <td title="${query.message}">${messagePreview}</td>
                    <td>${query.intent || 'General'}</td>
                    <td>${timeAgo}</td>
                `;
                table.appendChild(row);
            });
        }
    } catch (error) {
        console.error('Error loading recent queries:', error);
    }
}

// Knowledge Base Management
function showKnowledgeForm(entry = null) {
    const form = document.getElementById('knowledgeForm');
    const formTitle = document.getElementById('knowledgeFormTitle');
    
    if (entry) {
        formTitle.textContent = '✏️ Edit Knowledge Entry';
        document.getElementById('entryId').value = entry.id;
        document.getElementById('category').value = entry.category;
        document.getElementById('title').value = entry.title;
        document.getElementById('content').value = entry.content;
        document.getElementById('language').value = entry.language;
        document.getElementById('tags').value = entry.tags.join(', ');
        document.getElementById('source').value = entry.source;
        document.getElementById('isActive').checked = entry.is_active;
    } else {
        formTitle.textContent = '➕ Add New Health Information';
        document.getElementById('knowledgeEntryForm').reset();
        document.getElementById('entryId').value = '';
        document.getElementById('source').value = 'WHO';
        document.getElementById('isActive').checked = true;
    }
    
    form.style.display = 'block';
    form.scrollIntoView({ behavior: 'smooth' });
}

function hideKnowledgeForm() {
    document.getElementById('knowledgeForm').style.display = 'none';
}

// Handle knowledge form submission
document.getElementById('knowledgeEntryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = {
        category: document.getElementById('category').value,
        title: document.getElementById('title').value,
        content: document.getElementById('content').value,
        language: document.getElementById('language').value,
        tags: document.getElementById('tags').value.split(',').map(tag => tag.trim()).filter(tag => tag),
        source: document.getElementById('source').value,
        is_active: document.getElementById('isActive').checked
    };
    
    const entryId = document.getElementById('entryId').value;
    
    try {
        const url = entryId ? 
            `${API_BASE}/admin/knowledge-base/${entryId}` : 
            `${API_BASE}/admin/knowledge-base`;
            
        const method = entryId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: getHeaders(),
            body: JSON.stringify(formData)
        });
        
        if (!response.ok) throw new Error('Failed to save entry');
        
        showSuccess('Entry saved successfully!');
        hideKnowledgeForm();
        loadKnowledgeBase();
        
    } catch (error) {
        console.error('Error saving entry:', error);
        showError('Failed to save entry');
    }
});

async function editKnowledgeEntry(id) {
    try {
        const response = await fetch(`${API_BASE}/admin/knowledge-base`, {
            headers: getHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to fetch entries');
        
        const data = await response.json();
        const entry = data.knowledge_base.find(e => e.id === id);
        
        if (entry) {
            showKnowledgeForm(entry);
        }
    } catch (error) {
        console.error('Error editing entry:', error);
        showError('Failed to load entry for editing');
    }
}

async function toggleKnowledgeEntry(id, newStatus) {
    try {
        const response = await fetch(`${API_BASE}/admin/knowledge-base/${id}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ is_active: newStatus })
        });
        
        if (!response.ok) throw new Error('Failed to update entry');
        
        showSuccess(`Entry ${newStatus ? 'activated' : 'deactivated'} successfully!`);
        loadKnowledgeBase();
        
    } catch (error) {
        console.error('Error toggling entry:', error);
        showError('Failed to update entry');
    }
}

async function deleteKnowledgeEntry(id) {
    if (!confirm('Are you sure you want to delete this entry? This action cannot be undone.')) return;
    
    try {
        const response = await fetch(`${API_BASE}/admin/knowledge-base/${id}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to delete entry');
        
        showSuccess('Entry deleted successfully!');
        loadKnowledgeBase();
        
    } catch (error) {
        console.error('Error deleting entry:', error);
        showError('Failed to delete entry');
    }
}

// User Management
async function editUserRole(userId, currentRole) {
    const newRole = prompt('Enter new role (user/admin):', currentRole);
    if (newRole && ['user', 'admin'].includes(newRole.toLowerCase())) {
        try {
            const response = await fetch(`${API_BASE}/admin/users/${userId}`, {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({ role: newRole.toLowerCase() })
            });
            
            if (!response.ok) throw new Error('Failed to update user role');
            
            showSuccess('User role updated successfully!');
            loadUsers();
            
        } catch (error) {
            console.error('Error updating user role:', error);
            showError('Failed to update user role');
        }
    }
}

async function toggleUserStatus(userId, newStatus) {
    try {
        const response = await fetch(`${API_BASE}/admin/users/${userId}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ is_active: newStatus })
        });
        
        if (!response.ok) throw new Error('Failed to update user status');
        
        showSuccess(`User ${newStatus ? 'activated' : 'deactivated'} successfully!`);
        loadUsers();
        
    } catch (error) {
        console.error('Error toggling user status:', error);
        showError('Failed to update user status');
    }
}

// Chart functions
function createQueryTrendsChart(trends) {
    const ctx = document.getElementById('queryTrendsChart').getContext('2d');
    
    // Ensure we have data for the last 7 days
    const last7Days = Array.from({length: 7}, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        return date.toISOString().split('T')[0];
    });
    
    const dates = last7Days.map(date => {
        const d = new Date(date);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    const counts = last7Days.map(date => {
        const trend = trends.find(t => t.date === date);
        return trend ? trend.count : 0;
    });
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'Daily Queries',
                data: counts,
                borderColor: '#5dd9c1',
                backgroundColor: 'rgba(93, 217, 193, 0.1)',
                tension: 0.4,
                fill: true,
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#b0c4de' }
                },
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#b0c4de' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#b0c4de' }
                }
            }
        }
    });
}

function createIntentsChart(intents) {
    const ctx = document.getElementById('intentsChart').getContext('2d');
    
    const labels = intents.map(i => i.intent ? i.intent.replace('_', ' ').toUpperCase() : 'GENERAL');
    const counts = intents.map(i => i.count);
    
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: counts,
                backgroundColor: [
                    '#5dd9c1', '#3bc4a8', '#2aa893', '#1a8c7d', '#0f7067',
                    '#0d5c55', '#0b4944', '#093833'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#b0c4de',
                        padding: 20
                    }
                }
            }
        }
    });
}

// Utility functions
function animateCounter(elementId, targetValue) {
    const element = document.getElementById(elementId);
    const current = parseInt(element.textContent) || 0;
    const increment = targetValue > current ? 1 : -1;
    
    let currentValue = current;
    const timer = setInterval(() => {
        currentValue += increment;
        element.textContent = currentValue.toLocaleString();
        
        if (currentValue === targetValue) {
            clearInterval(timer);
        }
    }, 20);
}

function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
}

function showLoading(section) {
    const table = document.querySelector(`#${section} .data-table tbody`);
    if (table) {
        table.innerHTML = '<tr><td colspan="10" style="text-align: center; color: #b0c4de; padding: 40px;">Loading data...</td></tr>';
    }
}

function showSuccess(message) {
    // Create a nice notification
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #5dd9c1;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(93, 217, 193, 0.3);
        z-index: 1000;
        font-weight: 600;
    `;
    notification.textContent = `✅ ${message}`;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function showError(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ff6b6b;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(255, 107, 107, 0.3);
        z-index: 1000;
        font-weight: 600;
    `;
    notification.textContent = `❌ ${message}`;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function logout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('token');
    window.location.href = '/';
}

// Auto-refresh dashboard every 30 seconds
setInterval(() => {
    if (currentSection === 'dashboard') {
        loadDashboardStats();
    }
}, 30000);

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    loadDashboardStats();
});
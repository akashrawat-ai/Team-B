from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
import datetime
from functools import wraps
import json
import requests
from sqlalchemy import func, desc

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ==================== CONFIGURATION ====================
app.config['SECRET_KEY'] = 'wellbot-secret-key-2024-change-in-production'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///wellbot.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JSON_SORT_KEYS'] = False

# Rasa Configuration
RASA_API_URL = "http://localhost:5005/webhooks/rest/webhook"
USE_RASA = False  # Set to True if Rasa is running

db = SQLAlchemy(app)

# ==================== DATABASE MODELS ====================

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    preferred_language = db.Column(db.String(50), default='en')
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    age_group = db.Column(db.String(50))
    gender = db.Column(db.String(50))
    exercise_hours = db.Column(db.String(50))
    health_conditions = db.Column(db.Text)
    role = db.Column(db.String(20), default='user')
    last_login = db.Column(db.DateTime)
    is_active = db.Column(db.Boolean, default=True)
    conversations = db.relationship('Conversation', backref='user', lazy=True, cascade='all, delete-orphan')
    feedbacks = db.relationship('Feedback', backref='user', lazy=True)

class Conversation(db.Model):
    __tablename__ = 'conversations'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    start_time = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    end_time = db.Column(db.DateTime)
    messages = db.relationship('Message', backref='conversation', lazy=True, cascade='all, delete-orphan')

class Message(db.Model):
    __tablename__ = 'messages'
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversations.id'), nullable=False)
    sender = db.Column(db.String(50), nullable=False)  # 'user' or 'bot'
    message = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    intent = db.Column(db.String(100))
    confidence = db.Column(db.Float, default=0.0)

class Feedback(db.Model):
    __tablename__ = 'feedback'
    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.Integer, db.ForeignKey('messages.id'))
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    rating = db.Column(db.String(20))  # 'positive' or 'negative'
    comment = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

class HealthKnowledgeBase(db.Model):
    __tablename__ = 'health_knowledge_base'
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(100), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    content = db.Column(db.Text, nullable=False)
    language = db.Column(db.String(10), default='en')
    tags = db.Column(db.Text)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class AdminActivity(db.Model):
    __tablename__ = 'admin_activities'
    id = db.Column(db.Integer, primary_key=True)
    admin_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    action = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    ip_address = db.Column(db.String(50))
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

# ==================== HELPER FUNCTIONS ====================

def init_db():
    """Initialize database with admin user and sample data"""
    with app.app_context():
        db.create_all()
        
        # Create admin user if not exists
        admin_email = "admin@wellbot.com"
        admin_user = User.query.filter_by(email=admin_email).first()
        
        if not admin_user:
            hashed_password = generate_password_hash("admin123")
            admin_user = User(
                username="admin",
                email=admin_email,
                password_hash=hashed_password,
                role="admin"
            )
            db.session.add(admin_user)
            db.session.commit()
        
        print("✅ Database initialized successfully!")

def token_required(f):
    """Decorator to protect routes with JWT authentication"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        
        if not token:
            return jsonify({'message': 'Token is missing'}), 401
        
        try:
            if token.startswith('Bearer '):
                token = token.split(' ')[1]
            
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user = User.query.get(data['user_id'])
            
            if not current_user or not current_user.is_active:
                return jsonify({'message': 'User not found or inactive'}), 401
                
        except jwt.ExpiredSignatureError:
            return jsonify({'message': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'message': 'Invalid token'}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated

def admin_required(f):
    """Decorator to protect admin routes"""
    @wraps(f)
    def decorated(current_user, *args, **kwargs):
        if current_user.role != 'admin':
            return jsonify({'message': 'Admin access required'}), 403
        return f(current_user, *args, **kwargs)
    return decorated

def detect_intent_and_language(message):
    """Detect intent and language from message"""
    message_lower = message.lower()
    
    # Language detection
    hindi_chars = any('\u0900' <= char <= '\u097F' for char in message)
    detected_lang = 'hi' if hindi_chars else 'en'
    
    # Intent detection
    intent_keywords = {
        'headache': ['headache', 'head pain', 'migraine', 'sir dard', 'सिरदर्द'],
        'fever': ['fever', 'temperature', 'bukhar', 'बुखार', 'tap'],
        'cold_flu': ['cold', 'flu', 'cough', 'sardi', 'jukam', 'सर्दी', 'जुकाम'],
        'cut_wound': ['cut', 'wound', 'bleeding', 'injury', 'chot', 'ghav', 'घाव'],
        'exercise': ['exercise', 'workout', 'fitness', 'vyayam', 'व्यायाम'],
        'diet': ['diet', 'food', 'nutrition', 'bhojan', 'भोजन', 'khana'],
    }
    
    detected_intent = 'general'
    max_matches = 0
    
    for intent, keywords in intent_keywords.items():
        matches = sum(1 for keyword in keywords if keyword in message_lower)
        if matches > max_matches:
            max_matches = matches
            detected_intent = intent
    
    return detected_intent, detected_lang

def get_response_from_knowledge_base(intent, language):
    """Get response based on intent and language"""
    
    knowledge_base = {
        'headache': {
            'en': """For mild headaches:
- Rest in a quiet, dark room
- Drink plenty of water (dehydration causes headaches)
- Apply cold compress to forehead
- Take over-the-counter pain relievers if needed
- Avoid screens and bright lights

⚠️ Seek medical help if:
- Headache is sudden and severe
- Persists for more than 3 days
- Accompanied by fever, stiff neck, or vision changes

⚠️ Medical Disclaimer: This is general information only. Always consult a healthcare professional for medical advice.""",
            'hi': """हल्के सिरदर्द के लिए:
- शांत, अंधेरे कमरे में आराम करें
- भरपूर पानी पिएं (निर्जलीकरण से सिरदर्द होता है)
- माथे पर ठंडा सेक करें
- यदि आवश्यक हो तो दर्द निवारक लें
- स्क्रीन और तेज रोशनी से बचें

⚠️ चिकित्सा सहायता लें यदि:
- सिरदर्द अचानक और गंभीर है
- 3 दिनों से अधिक समय तक बना रहता है
- बुखार, गर्दन में अकड़न या दृष्टि परिवर्तन के साथ

⚠️ चिकित्सा अस्वीकरण: यह केवल सामान्य जानकारी है। चिकित्सा सलाह के लिए हमेशा स्वास्थ्य पेशेवर से परामर्श करें。"""
        },
        'fever': {
            'en': """Managing mild fever (below 102°F/38.9°C):

✅ Do:
- Rest and stay hydrated
- Drink plenty of water, juice, or soup
- Take lukewarm bath (not cold)
- Wear light clothing
- Monitor temperature regularly

⚠️ Seek immediate help if:
- Fever above 103°F (39.4°C)
- Lasts more than 3 days
- Accompanied by severe symptoms

⚠️ Medical Disclaimer: This is general information only. Consult a healthcare professional.""",
            'hi': """हल्के बुखार का प्रबंधन (102°F/38.9°C से नीचे):

✅ करें:
- आराम करें और हाइड्रेटेड रहें
- भरपूर पानी, जूस या सूप पिएं
- गुनगुना स्नान करें (ठंडा नहीं)
- हल्के कपड़े पहनें
- नियमित रूप से तापमान की निगरानी करें

⚠️ तत्काल सहायता लें यदि:
- बुखार 103°F (39.4°C) से ऊपर
- 3 दिनों से अधिक समय तक रहता है
- गंभीर लक्षणों के साथ

⚠️ चिकित्सा अस्वीकरण: यह केवल सामान्य जानकारी है। स्वास्थ्य पेशेवर से परामर्श करें।"""
        },
        'general': {
            'en': """I'm here to help with general health information. You can ask me about:
- Common symptoms (headache, fever, cold)
- First aid basics
- Exercise and wellness tips
- Healthy eating habits

⚠️ For serious health concerns, please consult a healthcare professional immediately.

What would you like to know?""",
            'hi': """मैं सामान्य स्वास्थ्य जानकारी में मदद के लिए यहां हूं। आप मुझसे पूछ सकते हैं:
- सामान्य लक्षण (सिरदर्द, बुखार, सर्दी)
- प्राथमिक चिकित्सा मूल बातें
- व्यायाम और स्वास्थ्य सुझाव
- स्वस्थ खान-पान की आदतें

⚠️ गंभीर स्वास्थ्य समस्याओं के लिए, कृपया तुरंत स्वास्थ्य पेशेवर से परामर्श करें।

आप क्या जानना चाहेंगे?"""
        }
    }
    
    return knowledge_base.get(intent, knowledge_base['general']).get(language, knowledge_base[intent]['en'])

def get_rasa_response(user_message, sender_id):
    """Get response from Rasa (optional)"""
    if not USE_RASA:
        return None
        
    try:
        payload = {"sender": sender_id, "message": user_message}
        response = requests.post(RASA_API_URL, json=payload, timeout=5)
        
        if response.status_code == 200:
            rasa_responses = response.json()
            if rasa_responses:
                combined_response = "\n\n".join([r.get('text', '') for r in rasa_responses if 'text' in r])
                return combined_response
    except Exception as e:
        print(f"❌ Rasa error: {str(e)}")
    
    return None

# ==================== FRONTEND ROUTES ====================

@app.route('/')
def index():
    """Serve frontend application"""
    return render_template('index.html')

@app.route('/chat')
def chat_page():
    """Serve chat page"""
    return render_template('chat.html')

@app.route('/profile')
def profile_page():
    """Serve profile page"""
    return render_template('profile.html')

@app.route('/admin')
def admin_page():
    """Serve admin dashboard"""
    return render_template('admin.html')

# ==================== API ROUTES ====================

@app.route('/api/health', methods=['GET'])
def health_check():
    """API health check"""
    return jsonify({
        'status': 'healthy',
        'message': 'WellBot API is running!',
        'version': '2.0',
        'timestamp': datetime.datetime.utcnow().isoformat()
    }), 200

@app.route('/api/signup', methods=['POST'])
def signup():
    """User registration"""
    try:
        data = request.get_json()
        
        if not data or not data.get('email') or not data.get('password'):
            return jsonify({'message': 'Email and password are required'}), 400
        
        if User.query.filter_by(email=data['email']).first():
            return jsonify({'message': 'Email already registered'}), 400
        
        if len(data['password']) < 6:
            return jsonify({'message': 'Password must be at least 6 characters'}), 400
        
        hashed_password = generate_password_hash(data['password'])
        new_user = User(
            username=data.get('username', data['email'].split('@')[0]),
            email=data['email'],
            password_hash=hashed_password
        )
        
        db.session.add(new_user)
        db.session.commit()
        
        token = jwt.encode({
            'user_id': new_user.id,
            'exp': datetime.datetime.utcnow() + datetime.timedelta(days=30)
        }, app.config['SECRET_KEY'], algorithm='HS256')
        
        print(f"✅ User registered: {new_user.email}")
        
        return jsonify({
            'message': 'Account created successfully!',
            'token': token,
            'user_id': new_user.id,
            'has_profile': False
        }), 201
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ Signup error: {str(e)}")
        return jsonify({'message': 'Registration failed. Please try again.'}), 500

@app.route('/api/signin', methods=['POST'])
def signin():
    """User login"""
    try:
        data = request.get_json()
        
        if not data or not data.get('email') or not data.get('password'):
            return jsonify({'message': 'Email and password are required'}), 400
        
        user = User.query.filter_by(email=data['email']).first()
        
        if not user or not check_password_hash(user.password_hash, data['password']):
            return jsonify({'message': 'Invalid email or password'}), 401
        
        # Update last login
        user.last_login = datetime.datetime.utcnow()
        db.session.commit()
        
        token = jwt.encode({
            'user_id': user.id,
            'exp': datetime.datetime.utcnow() + datetime.timedelta(days=30)
        }, app.config['SECRET_KEY'], algorithm='HS256')
        
        print(f"✅ User logged in: {user.email}")
        
        return jsonify({
            'message': 'Login successful!',
            'token': token,
            'user_id': user.id,
            'username': user.username,
            'has_profile': bool(user.age_group),
            'role': user.role
        }), 200
        
    except Exception as e:
        print(f"❌ Signin error: {str(e)}")
        return jsonify({'message': 'Login failed. Please try again.'}), 500

@app.route('/api/profile', methods=['GET', 'POST'])
@token_required
def profile(current_user):
    """Get or update user profile"""
    try:
        if request.method == 'GET':
            return jsonify({
                'username': current_user.username,
                'email': current_user.email,
                'age_group': current_user.age_group,
                'gender': current_user.gender,
                'exercise_hours': current_user.exercise_hours,
                'health_conditions': json.loads(current_user.health_conditions) if current_user.health_conditions else [],
                'preferred_language': current_user.preferred_language
            }), 200
        
        elif request.method == 'POST':
            data = request.get_json()
            
            if data.get('name'):
                current_user.username = data['name']
            if data.get('age_group'):
                current_user.age_group = data['age_group']
            if data.get('gender'):
                current_user.gender = data['gender']
            if data.get('exercise_hours'):
                current_user.exercise_hours = data['exercise_hours']
            if 'health_conditions' in data:
                current_user.health_conditions = json.dumps(data['health_conditions'])
            if data.get('language'):
                current_user.preferred_language = data['language']
            
            db.session.commit()
            
            print(f"✅ Profile updated: {current_user.email}")
            
            return jsonify({
                'message': 'Profile updated successfully!',
                'has_profile': True
            }), 200
            
    except Exception as e:
        db.session.rollback()
        print(f"❌ Profile error: {str(e)}")
        return jsonify({'message': 'Profile update failed'}), 500

@app.route('/api/chat', methods=['POST'])
@token_required
def chat(current_user):
    """Handle chat messages"""
    try:
        data = request.get_json()
        
        if not data or not data.get('message'):
            return jsonify({'message': 'Message is required'}), 400
        
        user_message = data['message'].strip()
        
        if not user_message or len(user_message) > 1000:
            return jsonify({'message': 'Invalid message length'}), 400
        
        # Get or create active conversation
        active_conv = Conversation.query.filter_by(
            user_id=current_user.id,
            end_time=None
        ).first()
        
        if not active_conv:
            active_conv = Conversation(user_id=current_user.id)
            db.session.add(active_conv)
            db.session.commit()
        
        # Save user message
        user_msg = Message(
            conversation_id=active_conv.id,
            sender='user',
            message=user_message
        )
        db.session.add(user_msg)
        db.session.commit()
        
        # Detect intent and language
        intent, detected_lang = detect_intent_and_language(user_message)
        
        # Use user's preferred language if set, otherwise use detected
        response_lang = current_user.preferred_language or detected_lang
        
        print(f"💬 Message: {user_message[:50]}... | Intent: {intent} | Lang: {response_lang}")
        
        # Try Rasa first (if enabled), fallback to knowledge base
        response = get_rasa_response(user_message, f"user_{current_user.id}") if USE_RASA else None
        
        if not response:
            response = get_response_from_knowledge_base(intent, response_lang)
        
        confidence = 0.85 if intent != 'general' else 0.5
        
        # Save bot response
        bot_msg = Message(
            conversation_id=active_conv.id,
            sender='bot',
            message=response,
            intent=intent,
            confidence=confidence
        )
        db.session.add(bot_msg)
        db.session.commit()
        
        return jsonify({
            'response': response,
            'intent': intent,
            'confidence': confidence,
            'message_id': bot_msg.id,
            'timestamp': datetime.datetime.utcnow().isoformat()
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"❌ Chat error: {str(e)}")
        return jsonify({'message': 'Failed to process message'}), 500

@app.route('/api/conversation/history', methods=['GET'])
@token_required
def get_history(current_user):
    """Get conversation history"""
    try:
        conversations = Conversation.query.filter_by(
            user_id=current_user.id
        ).order_by(Conversation.start_time.desc()).limit(10).all()
        
        history = []
        for conv in conversations:
            messages = []
            for msg in conv.messages:
                messages.append({
                    'sender': msg.sender,
                    'message': msg.message,
                    'intent': msg.intent,
                    'timestamp': msg.timestamp.isoformat()
                })
            
            history.append({
                'conversation_id': conv.id,
                'start_time': conv.start_time.isoformat(),
                'messages': messages
            })
        
        return jsonify({'history': history}), 200
        
    except Exception as e:
        print(f"❌ History error: {str(e)}")
        return jsonify({'message': 'Failed to fetch history'}), 500

@app.route('/api/feedback', methods=['POST'])
@token_required
def submit_feedback(current_user):
    """Submit feedback for bot responses"""
    try:
        data = request.get_json()
        
        if not data or not data.get('message_id'):
            return jsonify({'message': 'Message ID is required'}), 400
        
        feedback = Feedback(
            message_id=data['message_id'],
            user_id=current_user.id,
            rating=data.get('rating'),
            comment=data.get('comment')
        )
        
        db.session.add(feedback)
        db.session.commit()
        
        return jsonify({'message': 'Feedback submitted successfully!'}), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': 'Failed to submit feedback'}), 500

# ==================== ADMIN API ROUTES ====================

@app.route('/api/admin/dashboard/stats', methods=['GET'])
@token_required
@admin_required
def admin_dashboard_stats(current_user):
    """Get admin dashboard statistics"""
    try:
        # Total users
        total_users = User.query.count()
        
        # Active users (last 30 days)
        thirty_days_ago = datetime.datetime.utcnow() - datetime.timedelta(days=30)
        active_users = User.query.filter(User.last_login >= thirty_days_ago).count()
        
        # Total queries
        total_queries = Message.query.filter_by(sender='user').count()
        
        # Total conversations
        total_conversations = Conversation.query.count()
        
        # Health topics
        health_topics = HealthKnowledgeBase.query.filter_by(is_active=True).count()
        
        # Feedback stats
        total_feedback = Feedback.query.count()
        positive_feedback = Feedback.query.filter_by(rating='positive').count()
        positive_percentage = round((positive_feedback / total_feedback * 100), 2) if total_feedback > 0 else 0
        
        # Recent queries (last 7 days)
        seven_days_ago = datetime.datetime.utcnow() - datetime.timedelta(days=7)
        daily_queries = db.session.query(
            func.date(Message.timestamp).label('date'),
            func.count(Message.id).label('count')
        ).filter(
            Message.sender == 'user',
            Message.timestamp >= seven_days_ago
        ).group_by(func.date(Message.timestamp)).all()
        
        query_trends = [{'date': str(q.date), 'count': q.count} for q in daily_queries]
        
        # Top intents
        top_intents = db.session.query(
            Message.intent,
            func.count(Message.id).label('count')
        ).filter(
            Message.intent.isnot(None)
        ).group_by(Message.intent).order_by(desc('count')).limit(5).all()
        
        top_intents_data = [{'intent': i.intent or 'general', 'count': i.count} for i in top_intents]
        
        return jsonify({
            'total_users': total_users,
            'active_users': active_users,
            'total_queries': total_queries,
            'total_conversations': total_conversations,
            'health_topics': health_topics,
            'positive_feedback_percentage': positive_percentage,
            'positive_feedback_count': positive_feedback,
            'total_feedback_count': total_feedback,
            'query_trends': query_trends,
            'top_intents': top_intents_data
        }), 200
        
    except Exception as e:
        return jsonify({'message': 'Failed to fetch dashboard stats'}), 500

@app.route('/api/admin/users', methods=['GET'])
@token_required
@admin_required
def admin_users(current_user):
    """Get all users for admin"""
    try:
        users = User.query.order_by(desc(User.created_at)).all()
        
        users_data = []
        for user in users:
            conv_count = Conversation.query.filter_by(user_id=user.id).count()
            msg_count = Message.query.join(Conversation).filter(Conversation.user_id == user.id).count()
            
            users_data.append({
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'age_group': user.age_group,
                'gender': user.gender,
                'preferred_language': user.preferred_language,
                'conversations_count': conv_count,
                'messages_count': msg_count,
                'created_at': user.created_at.isoformat(),
                'last_login': user.last_login.isoformat() if user.last_login else None,
                'role': user.role,
                'is_active': user.is_active
            })
        
        return jsonify({'users': users_data}), 200
        
    except Exception as e:
        return jsonify({'message': 'Failed to fetch users'}), 500

@app.route('/api/admin/feedback', methods=['GET'])
@token_required
@admin_required
def admin_feedback(current_user):
    """Get all feedback for admin"""
    try:
        feedbacks = Feedback.query.join(User).order_by(desc(Feedback.created_at)).all()
        
        feedback_data = []
        for fb in feedbacks:
            message = Message.query.get(fb.message_id)
            feedback_data.append({
                'id': fb.id,
                'user_email': fb.user.email,
                'user_message': message.message if message and message.sender == 'user' else 'Bot response',
                'rating': fb.rating,
                'comment': fb.comment,
                'created_at': fb.created_at.isoformat()
            })
        
        return jsonify({'feedback': feedback_data}), 200
        
    except Exception as e:
        return jsonify({'message': 'Failed to fetch feedback'}), 500

@app.route('/api/admin/knowledge-base', methods=['GET', 'POST'])
@token_required
@admin_required
def admin_knowledge_base(current_user):
    """Manage knowledge base"""
    try:
        if request.method == 'GET':
            entries = HealthKnowledgeBase.query.order_by(desc(HealthKnowledgeBase.updated_at)).all()
            
            knowledge_data = []
            for entry in entries:
                knowledge_data.append({
                    'id': entry.id,
                    'category': entry.category,
                    'title': entry.title,
                    'content': entry.content,
                    'language': entry.language,
                    'tags': json.loads(entry.tags) if entry.tags else [],
                    'is_active': entry.is_active,
                    'created_at': entry.created_at.isoformat(),
                    'updated_at': entry.updated_at.isoformat()
                })
            
            return jsonify({'knowledge_base': knowledge_data}), 200
        
        elif request.method == 'POST':
            data = request.get_json()
            
            new_entry = HealthKnowledgeBase(
                category=data['category'],
                title=data['title'],
                content=data['content'],
                language=data.get('language', 'en'),
                tags=json.dumps(data.get('tags', []))
            )
            
            db.session.add(new_entry)
            db.session.commit()
            
            return jsonify({'message': 'Knowledge base entry added successfully'}), 201
            
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': 'Operation failed'}), 500

@app.route('/api/admin/database-preview', methods=['GET'])
@token_required
@admin_required
def admin_database_preview(current_user):
    """Get database preview with all tables data"""
    try:
        # Get users data
        users = User.query.order_by(desc(User.created_at)).limit(50).all()
        users_data = []
        for user in users:
            users_data.append({
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'age_group': user.age_group,
                'gender': user.gender,
                'preferred_language': user.preferred_language,
                'role': user.role,
                'created_at': user.created_at.isoformat(),
                'last_login': user.last_login.isoformat() if user.last_login else None
            })

        # Get conversations data
        conversations = Conversation.query.order_by(desc(Conversation.start_time)).limit(50).all()
        conversations_data = []
        for conv in conversations:
            conversations_data.append({
                'id': conv.id,
                'user_id': conv.user_id,
                'user_email': conv.user.email if conv.user else 'Unknown',
                'start_time': conv.start_time.isoformat(),
                'end_time': conv.end_time.isoformat() if conv.end_time else None,
                'message_count': len(conv.messages)
            })

        # Get messages data
        messages = Message.query.order_by(desc(Message.timestamp)).limit(100).all()
        messages_data = []
        for msg in messages:
            messages_data.append({
                'id': msg.id,
                'conversation_id': msg.conversation_id,
                'sender': msg.sender,
                'message': msg.message[:100] + '...' if len(msg.message) > 100 else msg.message,
                'intent': msg.intent,
                'confidence': msg.confidence,
                'timestamp': msg.timestamp.isoformat()
            })

        # Get feedback data
        feedbacks = Feedback.query.order_by(desc(Feedback.created_at)).limit(50).all()
        feedback_data = []
        for fb in feedbacks:
            feedback_data.append({
                'id': fb.id,
                'user_id': fb.user_id,
                'user_email': fb.user.email if fb.user else 'Unknown',
                'message_id': fb.message_id,
                'rating': fb.rating,
                'comment': fb.comment,
                'created_at': fb.created_at.isoformat()
            })

        return jsonify({
            'users': users_data,
            'conversations': conversations_data,
            'messages': messages_data,
            'feedback': feedback_data,
            'totals': {
                'users': User.query.count(),
                'conversations': Conversation.query.count(),
                'messages': Message.query.count(),
                'feedback': Feedback.query.count()
            }
        }), 200

    except Exception as e:
        print(f"❌ Database preview error: {str(e)}")
        return jsonify({'message': 'Failed to fetch database preview'}), 500

# ==================== ERROR HANDLERS ====================

@app.errorhandler(404)
def not_found(error):
    return jsonify({'message': 'Resource not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return jsonify({'message': 'Internal server error'}), 500

# ==================== MAIN ====================

if __name__ == '__main__':
    init_db()
    print("\n" + "="*60)
    print("🏥 WellBot Backend Server Starting...")
    print("="*60)
    print(f"📡 Server: http://localhost:5000")
    print(f"🔗 Frontend: http://localhost:5000")
    print(f"👑 Admin Dashboard: http://localhost:5000/admin")
    print(f"🔑 Admin Login: admin@wellbot.com / admin123")
    print(f"🌍 CORS: Enabled for all origins")
    print(f"🗣️ Languages: English & Hindi")
    print("="*60)
    print("Press Ctrl+C to stop the server")
    print("="*60 + "\n")
    
    app.run(debug=True, host='0.0.0.0', port=5000)
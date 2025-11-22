import os

class Config:
    """Application configuration"""
    
    # Security
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'your-secret-key-change-in-production'
    
    # Database
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///wellbot.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # JWT
    JWT_EXPIRATION_DAYS = 365
    
    # Server
    HOST = '0.0.0.0'
    PORT = 5000
    DEBUG = True
    
    # CORS
    CORS_ORIGINS = ['http://localhost:5000', 'http://127.0.0.1:5000']
    
    # NLP Settings
    DEFAULT_LANGUAGE = 'en'
    SUPPORTED_LANGUAGES = ['en', 'hi']
    
    # Health Knowledge Base
    MIN_MATCH_SCORE = 1  # Minimum score for knowledge base match
    
    # Chat Settings
    MAX_MESSAGE_LENGTH = 1000
    MAX_CONVERSATION_HISTORY = 50
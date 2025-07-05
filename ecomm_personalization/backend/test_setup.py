import sys
import os
from pathlib import Path
from fastapi.testclient import TestClient

# Add the backend directory to Python path
backend_dir = str(Path(__file__).parent.absolute())
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

def test_imports():
    """Test that all required imports work"""
    try:
        print("Testing imports...")
        
        # Test core imports
        from fastapi import FastAPI
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        
        # Test app imports
        from main import app
        from app.api.v1.endpoints import products, recommendations
        
        print("All imports successful!")
        return True
        
    except ImportError as e:
        print(f"Import error: {e}")
        return False

def test_environment():
    """Test environment variables and configuration"""
    try:
        print("\nTesting environment...")
        
        # Check for required environment variables
        required_vars = ["ENVIRONMENT", "DATABASE_URL"]
        missing_vars = [var for var in required_vars if not os.getenv(var)]
        
        if missing_vars:
            print(f"Warning: Missing environment variables: {', '.join(missing_vars)}")
            return False
            
        print("Environment variables check passed!")
        return True
        
    except Exception as e:
        print(f"Environment test failed: {e}")
        return False

if __name__ == "__main__":
    print("Running test setup...\n")
    
    # Run tests
    imports_ok = test_imports()
    env_ok = test_environment()
    
    # Print summary
    print("\n=== Test Setup Summary ===")
    print(f"Imports: {'✅' if imports_ok else '❌'}")
    print(f"Environment: {'✅' if env_ok else '⚠️ (see warnings above)'}")
    
    if imports_ok and env_ok:
        print("\n✅ Setup test passed successfully!")
        sys.exit(0)
    else:
        print("\n❌ Setup test failed!")
        sys.exit(1)

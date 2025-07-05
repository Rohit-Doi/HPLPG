# Hyper-personalised-Landing-Page-Generator

## Overview
A full-stack e-commerce platform with advanced personalization, built with Next.js (frontend) and Python (FastAPI) backend. Features include user-specific recommendations, cold start strategies, Google login, user clustering, and a modern UI.

---

## Features
- **Personalized Product Recommendations**: Multi-strategy approach including demographics, engagement patterns, contextual recommendations, and matrix factorization
- **Cold Start Strategies**: Intelligent recommendations for new users using popular categories and diversity algorithms
- **Google Authentication**: Seamless login with Firebase Auth integration
- **User Clustering**: Advanced behavioral segmentation and user profiling
- **Modern UI/UX**: Responsive design with Next.js 15, Tailwind CSS, and Radix UI components
- **Complete E-commerce Flow**: Category pages, collections, sales, product details, cart, wishlist, and checkout
- **Admin & Testing Endpoints**: Comprehensive API testing and recommendation evaluation
- **Performance Evaluation**: Robust precision/recall metrics for recommendation quality

---

## Prerequisites

### System Requirements
- **Python**: 3.10 or higher
- **Node.js**: 18.0 or higher
- **npm**: 9.0 or higher
- **Git**: Latest version
- **RAM**: Minimum 8GB (16GB recommended for data processing)
- **Storage**: At least 5GB free space

### Windows Users: Resolving "Filename too long" Errors

If you encounter errors like `error: unable to create file ...: Filename too long` when cloning on Windows, follow these steps:

#### 1. Enable Long Path Support in Windows

**A. Using the Registry Editor (works on all Windows editions):**
1. Press `Win + R`, type `regedit`, and press Enter.
2. Navigate to:  
   `HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\FileSystem`
3. Find the entry named `LongPathsEnabled`.  
   - If it doesn't exist, right-click and create a new `DWORD (32-bit) Value` named `LongPathsEnabled`.
4. Double-click it and set its value to `1`.
5. Restart your computer.

**B. Using Group Policy Editor (if available):**
1. Press `Win + R`, type `gpedit.msc`, and press Enter.
2. Go to:  
   `Local Computer Policy > Computer Configuration > Administrative Templates > System > Filesystem`
3. Double-click **Enable Win32 long paths** and set it to **Enabled**.
4. Restart your computer.

#### 2. Tell Git to Allow Long Paths

Open a terminal and run:

```sh
git config --system core.longpaths true
```
or (if you don't have admin rights):

```sh
git config --global core.longpaths true
```

#### 3. Clone to a Short Directory Path

To further reduce the risk, clone the repository to a directory with a very short path, such as:

```
C:\repo
```

### Required Dependencies

This project uses Firebase for authentication. The `firebase` package is included in the frontend dependencies and will be installed automatically when you run `npm install`.

---

## Project Structure

```
HPLPGA/
├── ecomm_personalization/           # Main project directory
│   ├── backend/                     # FastAPI backend
│   │   ├── alembic/                 # Database migrations
│   │   │   ├── env.py
│   │   │   └── versions/
│   │   │       └── d4d5b5ad4f4d_initial_migration.py
│   │   ├── app/                     # Main application
│   │   │   ├── api/                 # API routes
│   │   │   │   ├── personalize/     # Personalization endpoints
│   │   │   │   │   └── route.py
│   │   │   │   └── v1/              # Version 1 API
│   │   │   │       ├── api.py
│   │   │   │       └── endpoints/   # API endpoints
│   │   │   │           ├── products.py
│   │   │   │           ├── profile.py
│   │   │   │           └── recommendations.py
│   │   │   ├── core/                # Core configuration
│   │   │   │   └── config.py
│   │   │   └── main.py              # FastAPI app entry point
│   │   ├── services/                # Business logic services
│   │   │   ├── data_processor.py    # Data processing utilities
│   │   │   └── recommendation_engine.py
│   │   ├── src/                     # Source code
│   │   │   └── recommendation/      # Recommendation algorithms
│   │   │       ├── cold_start_strategy.py
│   │   │       └── personalization_engine.py
│   │   ├── static/                  # Static files
│   │   ├── data/                    # Data storage (not in git)
│   │   ├── requirements.txt         # Python dependencies
│   │   ├── Dockerfile               # Docker configuration
│   │   └── docker-compose.yml
│   ├── project/                     # Next.js frontend
│   │   ├── app/                     # Next.js 15 app directory
│   │   │   ├── accessories/         # Category pages
│   │   │   │   └── page.tsx
│   │   │   ├── account/             # User account pages
│   │   │   │   └── page.tsx
│   │   │   ├── cart/                # Shopping cart
│   │   │   │   └── page.tsx
│   │   │   ├── checkout/            # Checkout flow
│   │   │   │   └── page.tsx
│   │   │   ├── login/               # Authentication
│   │   │   │   └── page.tsx
│   │   │   ├── men/                 # Product categories
│   │   │   │   └── page.tsx
│   │   │   ├── new-arrivals/        # New products
│   │   │   │   └── page.tsx
│   │   │   ├── product/             # Product details
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   ├── sale/                # Sale pages
│   │   │   │   ├── page.tsx
│   │   │   │   └── SaleClient.tsx
│   │   │   ├── signup/              # User registration
│   │   │   │   └── page.tsx
│   │   │   ├── trending/            # Trending products
│   │   │   │   └── page.tsx
│   │   │   ├── women/               # Product categories
│   │   │   │   └── page.tsx
│   │   │   ├── wishlist/            # User wishlist
│   │   │   │   └── page.tsx
│   │   │   ├── globals.css          # Global styles
│   │   │   ├── HomeClient.tsx       # Home page client component
│   │   │   └── layout.tsx           # Root layout
│   │   ├── components/              # Reusable components
│   │   │   ├── ui/                  # UI components (Radix UI)
│   │   │   │   ├── accordion.tsx
│   │   │   │   ├── alert-dialog.tsx
│   │   │   │   ├── alert.tsx
│   │   │   │   ├── avatar.tsx
│   │   │   │   ├── badge.tsx
│   │   │   │   ├── button.tsx
│   │   │   │   ├── calendar.tsx
│   │   │   │   ├── card.tsx
│   │   │   │   ├── carousel.tsx
│   │   │   │   ├── checkbox.tsx
│   │   │   │   ├── collapsible.tsx
│   │   │   │   ├── command.tsx
│   │   │   │   ├── context-menu.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── dropdown-menu.tsx
│   │   │   │   ├── form.tsx
│   │   │   │   ├── hover-card.tsx
│   │   │   │   ├── input.tsx
│   │   │   │   ├── label.tsx
│   │   │   │   ├── menubar.tsx
│   │   │   │   ├── navigation-menu.tsx
│   │   │   │   ├── popover.tsx
│   │   │   │   ├── progress.tsx
│   │   │   │   ├── radio-group.tsx
│   │   │   │   ├── scroll-area.tsx
│   │   │   │   ├── select.tsx
│   │   │   │   ├── separator.tsx
│   │   │   │   ├── sheet.tsx
│   │   │   │   ├── skeleton.tsx
│   │   │   │   ├── slider.tsx
│   │   │   │   ├── switch.tsx
│   │   │   │   ├── table.tsx
│   │   │   │   ├── tabs.tsx
│   │   │   │   ├── textarea.tsx
│   │   │   │   ├── toast.tsx
│   │   │   │   ├── toggle.tsx
│   │   │   │   ├── toggle-group.tsx
│   │   │   │   ├── tooltip.tsx
│   │   │   │   └── use-toast.ts
│   │   │   ├── products/            # Product-specific components
│   │   │   │   ├── ProductCard.tsx
│   │   │   │   └── ProductDetailsClient.tsx
│   │   │   ├── Footer.tsx           # Site footer
│   │   │   ├── Navbar.tsx           # Navigation bar
│   │   │   └── ProductCard.tsx      # Product display component
│   │   ├── contexts/                # React contexts
│   │   │   ├── AuthContext.tsx      # Authentication context
│   │   │   ├── CartContext.tsx      # Shopping cart context
│   │   │   └── WishlistContext.tsx  # Wishlist context
│   │   ├── hooks/                   # Custom React hooks
│   │   │   └── use-toast.ts
│   │   ├── lib/                     # Utility libraries
│   │   ├── public/                  # Static assets
│   │   │   ├── accessories/         # Product images
│   │   │   ├── men/                 # Product images
│   │   │   ├── sale/                # Product images
│   │   │   ├── us/                  # Team images
│   │   │   ├── women/               # Product images
│   │   │   └── site.webmanifest
│   │   ├── package.json             # Node.js dependencies
│   │   ├── package-lock.json
│   │   ├── next.config.js           # Next.js configuration
│   │   ├── tailwind.config.ts       # Tailwind CSS configuration
│   │   ├── tsconfig.json            # TypeScript configuration
│   │   ├── postcss.config.js        # PostCSS configuration
│   │   ├── .eslintrc.json           # ESLint configuration
│   │   └── components.json          # Component configuration
│   ├── Data/                        # Large datasets (not in git) 
│   │    └── dataset1_final.csv      #activity data 
│   │    └── dataset2_final.csv      #transaction data    
│   ├── start_server.py              # Backend server startup script
│   └── README.md                    # Project documentation
├── recommendation_eval.py           # Performance evaluation script
├── package.json                     # Root package.json
├── package-lock.json
├── README.md                        # This file
├── .gitignore                       # Git ignore rules
├── venv/                            # Python virtual environment
├── .venv/                           # Alternative virtual environment
├── node_modules/                    # Node.js dependencies
└── lib/                             # Additional libraries
```

---

## Backend Setup (FastAPI)

### Step 1: Environment Setup

1. **Navigate to the backend directory:**
   ```bash
   cd ecomm_personalization/backend
   ```

2. **Create a virtual environment:**
   ```bash
   # Windows
   python -m venv venv
   venv\Scripts\activate

   # macOS/Linux
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

### Step 2: Data Setup

1. **Create data directory:**
   ```bash
   mkdir -p ../data
   ```

2. **Place your datasets in the data directory:**
   - `dataset1_final.csv` (user activity data)
   - `dataset2_final.csv` (transaction data)
   
   **Note:** These files are not included in git due to size. You must obtain them separately.

### Step 3: Database Setup

1. **Initialize Alembic (database migrations):**
   ```bash
   alembic init alembic
   alembic revision --autogenerate -m "Initial migration"
   alembic upgrade head
   ```

### Step 4: Model Training

1. **Train recommendation models and build user clusters:**
   ```bash
   # From the ecomm_personalization directory
   python -c "
   from data_processor import DataProcessor
   dp = DataProcessor(data_dir='data')
   dp.load_data().create_user_sessions().create_user_segments().build_recommendation_model()
   print('User clustering and cold start models built successfully.')
   "
   ```

### Step 5: Start the Backend Server

1. **From the project root:**
   ```bash
   python start_server.py
   ```

2. **Or from the backend directory:**
   ```bash
   cd ecomm_personalization/backend
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

3. **Verify the server is running:**
   - API: http://localhost:8000/api/v1
   - Documentation: http://localhost:8000/api/docs
   - Health check: http://localhost:8000/health

### Backend API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/personalize` | POST | Get personalized recommendations |
| `/api/v1/recommendations` | GET | Get general recommendations |
| `/api/v1/products` | GET | Get product information |
| `/api/v1/profile` | GET | Get user profile information |
| `/health` | GET | Health check endpoint |

---

## Frontend Setup (Next.js)

### Step 1: Environment Setup

1. **Navigate to the frontend directory:**
   ```bash
   cd ecomm_personalization/project
   ```

2. **Install Node.js dependencies:**
   ```bash
   npm install
   ```

### Step 2: Firebase Configuration

1. **Create a Firebase project:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create a new project
   - Enable Authentication with Google provider

2. **Create environment file:**
   ```bash
   # Create .env.local file
   touch .env.local
   ```

3. **Add Firebase configuration:**
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   ```

### Step 3: Start the Frontend Server

1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Verify the application is running:**
   - Frontend: http://localhost:3000
   - API docs: http://localhost:3000/api/docs

### Frontend Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run export` | Export static files |

---

## Performance Evaluation

### Running Evaluation Script

1. **Ensure both servers are running:**
   ```bash
   # Terminal 1 - Backend
   python start_server.py

   # Terminal 2 - Frontend
   cd ecomm_personalization/project
   npm run dev
   ```

2. **Run the evaluation script:**
   ```bash
   python recommendation_eval.py
   ```

### Expected Performance Results

Based on our testing, the system achieves:

- **Precision@5**: 0.78 (78% of recommended items are relevant)
- **Recall@5**: 0.65 (65% of relevant items are recommended)
- **Cold Start Precision**: 0.72 (72% accuracy for new users)
- **Cold Start Recall**: 0.58 (58% coverage for new users)
- **Diversity Score**: 0.85 (high diversity in recommendations)
- **Response Time**: <200ms average API response time

### Evaluation Metrics

The evaluation script provides:
- **User-specific metrics** for logged-in users
- **Cold start performance** for new users
- **Category-level evaluation** for recommendation diversity
- **Multi-user analysis** across different user segments

---

## Troubleshooting

### Common Issues and Solutions

#### 1. Python Import Errors

**Problem:** `ModuleNotFoundError` when running backend
```bash
# Solution: Ensure you're in the correct directory and virtual environment
cd ecomm_personalization/backend
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
```

#### 2. Node.js Version Issues

**Problem:** `npm install` fails with version errors
```bash
# Solution: Update Node.js to version 18+
# Check current version
node --version

# Install Node.js 18+ from https://nodejs.org/
```

#### 3. Port Already in Use

**Problem:** `Address already in use` error
```bash
# Solution: Kill processes using the ports
# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# macOS/Linux
lsof -ti:8000 | xargs kill -9
```

#### 4. Firebase Configuration Errors

**Problem:** Authentication not working
```bash
# Solution: Verify Firebase configuration
# 1. Check .env.local file exists
# 2. Verify all Firebase keys are correct
# 3. Ensure Google Auth is enabled in Firebase Console
```

#### 5. Data File Not Found

**Problem:** `FileNotFoundError` for datasets
```bash
# Solution: Place datasets in correct location
mkdir -p ecomm_personalization/data
# Copy dataset1_final.csv and dataset2_final.csv to this directory
```

#### 6. Memory Issues During Model Training

**Problem:** Out of memory during data processing
```bash
# Solution: Increase system resources or use smaller data sample
# Add to your Python script:
import pandas as pd
pd.options.mode.chunksize = 10000  # Process in chunks
```

#### 7. Windows Path Length Issues

**Problem:** File path too long errors
```bash
# Solution: Follow the Windows prerequisites section above
# Enable long paths in Windows registry
# Use shorter directory paths
```

#### 8. CORS Errors

**Problem:** Frontend can't connect to backend
```bash
# Solution: Ensure backend CORS is configured
# Check backend/app/main.py for CORS middleware
# Verify backend is running on correct port
```

### Debugging Commands

```bash
# Check Python version
python --version

# Check Node.js version
node --version

# Check npm version
npm --version

# List installed Python packages
pip list

# List installed npm packages
npm list --depth=0

# Check if ports are in use
netstat -an | grep :8000
netstat -an | grep :3000

# Check disk space
df -h  # Linux/macOS
dir    # Windows
```

---

## Development Workflow

### 1. Starting Development

```bash
# Terminal 1: Start backend
cd ecomm_personalization
python start_server.py

# Terminal 2: Start frontend
cd ecomm_personalization/project
npm run dev
```

### 2. Making Changes

- **Backend changes** will auto-reload due to `--reload` flag
- **Frontend changes** will auto-reload due to Next.js hot reload
- **Database changes** require running Alembic migrations

### 3. Testing

```bash
# Backend tests
cd ecomm_personalization/backend
pytest

# Frontend tests
cd ecomm_personalization/project
npm test

# Performance evaluation
python recommendation_eval.py
```

---

## Production Deployment

### Backend Deployment

1. **Build Docker image:**
   ```bash
   cd ecomm_personalization/backend
   docker build -t hplpga-backend .
   ```

2. **Run with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

### Frontend Deployment

1. **Build for production:**
   ```bash
   cd ecomm_personalization/project
   npm run build
   ```

2. **Deploy to Vercel/Netlify:**
   ```bash
   # Install Vercel CLI
   npm i -g vercel

   # Deploy
   vercel
   ```

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and evaluation
5. Submit a pull request

---



## Authors & Credits

- **Title**: Hyper-personalised Landing Page Generator
- **Built by**: K. Rohit   ,  C. Namish
- **Technologies**: Next.js 15, FastAPI, Python, Tailwind CSS, Firebase
- **Performance**: Precision@5: 0.78, Recall@5: 0.65, Response Time: <200ms












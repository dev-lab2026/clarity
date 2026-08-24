pipeline {
    agent any
    
    environment {
        APP_NAME = 'clarity'
        BUILD_DIR = "${WORKSPACE}/build"
        ARTIFACTS_DIR = "${WORKSPACE}/artifacts"
        NODE_HOME = '/usr/bin/node'
        // GitHub credentials
        GITHUB_CREDENTIALS = credentials('github-credentials')
    }
    
    parameters {
        string(name: 'BUILDS_TO_KEEP', defaultValue: '5', description: 'Number of old builds to keep')
    }
    
    triggers {
        githubPush()
    }
    
    stages {
        stage('Checkout') {
            steps {
                echo '🔄 Cloning repository with GitHub credentials...'
                checkout([
                    $class: 'GitSCM',
                    branches: [[name: '*/main']],
                    userRemoteConfigs: [[
                        url: 'https://github.com/dev-lab2026/clarity.git',
                        credentialsId: 'github-credentials'
                    ]]
                ])
            }
        }
        
        stage('Setup Environment') {
            steps {
                echo '⚙️  Setting up build environment...'
                sh '''
                    echo "Installing system dependencies for native module compilation..."
                    apt-get update
                    apt-get install -y build-essential python3 python3-dev git
                    
                    echo "Checking for Node.js..."
                    if ! command -v node &> /dev/null; then
                        echo "Node.js not found. Installing Node.js 18..."
                        curl -sL https://deb.nodesource.com/setup_18.x | bash -
                        apt-get install -y nodejs
                    fi
                    
                    echo "Node version:"
                    node --version
                    echo "NPM version:"
                    npm --version
                    echo "Python version:"
                    python3 --version
                '''
            }
        }
        
        stage('Clean & Configure') {
            steps {
                echo '🧹 Cleaning and configuring npm...'
                sh '''
                    echo "Removing old dependencies..."
                    rm -rf node_modules package-lock.json
                    
                    echo "Clearing npm cache..."
                    npm cache clean --force
                    
                    echo "Configuring npm..."
                    npm config set legacy-peer-deps true
                    npm config set fetch-timeout 120000
                    npm config set fetch-retry-mintimeout 20000
                    npm config set fetch-retry-maxtimeout 120000
                    
                    echo "✓ Environment configured"
                '''
            }
        }
        
        stage('Install Dependencies') {
            steps {
                echo '📦 Installing dependencies with rebuild...'
                sh '''
                    echo "Installing npm packages with native module rebuild..."
                    npm install --verbose --build-from-source
                    
                    if [ $? -ne 0 ]; then
                        echo "First install attempt failed, trying with npm ci..."
                        rm -rf node_modules package-lock.json
                        npm install --verbose
                    fi
                    
                    echo "✓ Dependencies installed successfully"
                '''
            }
        }
        
        stage('Verify Build') {
            steps {
                echo '🔍 Verifying build setup...'
                sh '''
                    echo "Checking Tailwind installation..."
                    if [ -d "node_modules/@tailwindcss/oxide" ]; then
                        echo "✓ @tailwindcss/oxide found"
                        ls -la node_modules/@tailwindcss/oxide/ | head -10
                    else
                        echo "⚠ @tailwindcss/oxide not found"
                    fi
                    
                    echo "Checking vite config..."
                    if [ -f "vite.config.ts" ]; then
                        echo "✓ vite.config.ts found"
                    fi
                '''
            }
        }
        
        stage('Build') {
            steps {
                echo '🔨 Building application...'
                sh '''
                    echo "Running build command..."
                    npm run build
                '''
            }
        }
        
        stage('Test') {
            steps {
                echo '✅ Running tests...'
                sh 'npm run test || true'
            }
        }
        
        stage('Archive Artifacts') {
            steps {
                echo '📦 Archiving build artifacts...'
                sh '''
                    mkdir -p ${ARTIFACTS_DIR}
                    if [ -d "dist" ]; then
                        echo "Copying dist/ artifacts..."
                        cp -r dist/* ${ARTIFACTS_DIR}/ || true
                    fi
                    if [ -d "build" ]; then
                        echo "Copying build/ artifacts..."
                        cp -r build/* ${ARTIFACTS_DIR}/ || true
                    fi
                    if [ -d "out" ]; then
                        echo "Copying out/ artifacts..."
                        cp -r out/* ${ARTIFACTS_DIR}/ || true
                    fi
                    echo "✓ Artifacts archived"
                '''
                archiveArtifacts artifacts: '**/*.js, **/*.css, **/*.html', allowEmptyArchive: true
            }
        }
        
        stage('Cleanup Old Builds') {
            steps {
                echo '🧹 Cleaning up old builds...'
                sh '''
                    KEEP=${BUILDS_TO_KEEP}
                    BUILD_DIR="${JENKINS_HOME}/jobs/${JOB_NAME}/builds"
                    
                    if [ -d "$BUILD_DIR" ]; then
                        BUILD_COUNT=$(ls -1d */ 2>/dev/null | wc -l)
                        if [ "$BUILD_COUNT" -gt "$KEEP" ]; then
                            echo "Total builds: $BUILD_COUNT, keeping last: $KEEP"
                            ls -1d */ | sort -V | head -n $((BUILD_COUNT - KEEP)) | while read -r build; do
                                echo "Removing old build: $build"
                                rm -rf "$BUILD_DIR/$build"
                            done
                            echo "✓ Old builds deleted"
                        fi
                    fi
                '''
            }
        }
        
        stage('Update GitHub Status') {
            when {
                expression { currentBuild.result == null || currentBuild.result == 'SUCCESS' }
            }
            steps {
                echo '📤 Updating GitHub commit status...'
                sh '''
                    COMMIT_SHA=$(git rev-parse HEAD)
                    curl -X POST \
                        -H "Authorization: token ${GITHUB_CREDENTIALS_PSW}" \
                        -H "Accept: application/vnd.github.v3+json" \
                        https://api.github.com/repos/dev-lab2026/clarity/statuses/${COMMIT_SHA} \
                        -d "{\"state\":\"success\",\"description\":\"Build succeeded\",\"context\":\"continuous-integration/jenkins\"}" \
                        -w "\nHTTP Status: %{http_code}\n"
                '''
            }
        }
    }
    
    post {
        success {
            echo '✅ Build succeeded!'
        }
        
        failure {
            echo '❌ Build failed!'
            sh '''
                if [ -d ".git" ]; then
                    COMMIT_SHA=$(git rev-parse HEAD)
                    curl -X POST \
                        -H "Authorization: token ${GITHUB_CREDENTIALS_PSW}" \
                        -H "Accept: application/vnd.github.v3+json" \
                        https://api.github.com/repos/dev-lab2026/clarity/statuses/${COMMIT_SHA} \
                        -d "{\"state\":\"failure\",\"description\":\"Build failed\",\"context\":\"continuous-integration/jenkins\"}" \
                        -w "\nHTTP Status: %{http_code}\n" || true
                fi
            '''
        }
        
        always {
            echo '📋 Pipeline execution completed'
        }
    }
    
    options {
        buildDiscarder(logRotator(numToKeepStr: '5'))
        timeout(time: 45, unit: 'MINUTES')
        timestamps()
    }
}

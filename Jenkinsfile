pipeline {
    agent any
    
    environment {
        APP_NAME = 'clarity'
        BUILD_DIR = "${WORKSPACE}/build"
        ARTIFACTS_DIR = "${WORKSPACE}/artifacts"
        NODE_HOME = '/usr/bin/node'
        // GitHub credentials (à configurer dans Jenkins)
        GITHUB_CREDENTIALS = credentials('github-credentials')
    }
    
    parameters {
        string(name: 'BUILDS_TO_KEEP', defaultValue: '5', description: 'Number of old builds to keep')
    }
    
    triggers {
        // Déclenche le build à chaque push
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
        
        stage('Setup') {
            steps {
                echo '⚙️  Setting up environment...'
                sh '''
                    echo "Checking for Node.js..."
                    which node || (echo "Node.js not found. Installing..." && curl -sL https://deb.nodesource.com/setup_18.x | bash - && apt-get install -y nodejs)
                    echo "Node version:"
                    node --version
                    echo "NPM version:"
                    npm --version
                '''
            }
        }
        
        stage('Clean Dependencies') {
            steps {
                echo '🧹 Cleaning npm cache and old dependencies...'
                sh '''
                    echo "Removing node_modules and package-lock.json..."
                    rm -rf node_modules package-lock.json
                    echo "Clearing npm cache..."
                    npm cache clean --force
                    echo "✓ Cache cleaned successfully"
                '''
            }
        }
        
        stage('Install Dependencies') {
            steps {
                echo '📦 Installing dependencies...'
                sh '''
                    echo "Installing npm packages..."
                    npm install --verbose
                    echo "✓ Dependencies installed successfully"
                '''
            }
        }
        
        stage('Build') {
            steps {
                echo '🔨 Building application...'
                sh '''
                    echo "Building with Vite..."
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
                    echo "✓ Artifacts archived successfully"
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
                            echo "✓ Old builds deleted successfully"
                        else
                            echo "Build count ($BUILD_COUNT) is less than or equal to KEEP ($KEEP), no cleanup needed"
                        fi
                    else
                        echo "Build directory not found: $BUILD_DIR"
                    fi
                '''
            }
        }
        
        stage('Update GitHub Status - Success') {
            when {
                expression { currentBuild.result == null || currentBuild.result == 'SUCCESS' }
            }
            steps {
                echo '📤 Updating GitHub commit status to SUCCESS...'
                sh '''
                    COMMIT_SHA=$(git rev-parse HEAD)
                    echo "Commit SHA: $COMMIT_SHA"
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
                else
                    echo "Git repository not available, skipping GitHub status update"
                fi
            '''
        }
        
        always {
            echo '📋 Pipeline execution completed'
        }
    }
    
    options {
        buildDiscarder(logRotator(numToKeepStr: '5'))
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
    }
}

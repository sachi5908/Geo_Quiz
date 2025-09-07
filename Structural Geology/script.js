document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selectors ---
    const loaderOverlay = document.getElementById('loader-overlay'); // Get the loader
    const quizContent = document.getElementById('quiz-content');
    const resultsContent = document.getElementById('results-content');
    const questionNumberDiv = document.getElementById('question-number');
    const questionMetaDiv = document.getElementById('question-meta');
    const quizDiv = document.getElementById('quiz-question');
    const optionsDiv = document.getElementById('quiz-options');
    const quizNavPalette = document.getElementById('quiz-nav');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const clearBtn = document.getElementById('clear-btn');
    const submitBtn = document.getElementById('submit');
    const retakeBtn = document.getElementById('retake-btn');
    const calcBtn = document.getElementById('calc-btn');
    const resultsDiv = document.getElementById('results');
    const finalScore = document.getElementById('final-score');
    const timerDisplay = document.getElementById('timer');
    const viewSolutionBtn = document.getElementById('view-solution-btn');
    const solutionDisplayContainer = document.getElementById('solution-display');
    const downloadSolutionsBtn = document.getElementById('download-solutions-btn');

    // --- State Variables ---
    let quizData = [];
    let quizAnswers = {};
    let currentQuestionIndex = 0;
    let visitedQuestions = new Set();
    let answeredQuestions = new Set();
    let timeLimitMinutes = 60;
    let timeRemaining = timeLimitMinutes * 60;
    let timerInterval;

    async function urlToGenerativePart(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${url}`);
        const blob = await response.blob();

        if (blob.type.includes('svg')) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth || 300;
                        canvas.height = img.naturalHeight || 150;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        const dataUrl = canvas.toDataURL('image/png');
                        const base64 = dataUrl.split(',')[1];
                        resolve({ inline_data: { mime_type: 'image/png', data: base64 } });
                    };
                    img.onerror = () => reject(new Error('Could not load SVG into image element.'));
                    img.src = reader.result;
                };
                reader.onerror = () => reject(new Error('Could not read image blob.'));
                reader.readAsDataURL(blob);
            });
        } else {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64 = reader.result.split(',')[1];
                    resolve({ inline_data: { mime_type: blob.type, data: base64 } });
                };
                reader.onerror = () => reject(new Error('Could not read image blob.'));
                reader.readAsDataURL(blob);
            });
        }
    }

    const buildMatchTable = (questionString) => {
        const lines = questionString.split('\n').filter(line => line.trim() !== '');
        lines.shift(); 
        const g1HeaderIndex = lines.findIndex(line => line.includes('Group I'));
        const g2HeaderIndex = lines.findIndex(line => line.includes('Group II'));
        if (g1HeaderIndex === -1 || g2HeaderIndex === -1) return null;
        const g1Header = lines[g1HeaderIndex];
        const g2Header = lines[g2HeaderIndex];
        const g1Items = lines.slice(g1HeaderIndex + 1, g2HeaderIndex);
        const g2Items = lines.slice(g2HeaderIndex + 1);
        const table = document.createElement('table');
        table.className = 'match-table';
        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        headerRow.insertCell().textContent = g1Header;
        headerRow.insertCell().textContent = g2Header;
        const tbody = table.createTBody();
        const maxRows = Math.max(g1Items.length, g2Items.length);
        for (let i = 0; i < maxRows; i++) {
            const row = tbody.insertRow();
            row.insertCell().textContent = g1Items[i] || '';
            row.insertCell().textContent = g2Items[i] || '';
        }
        return table;
    };

    const loadJSON = async (file) => {
        const response = await fetch(file);
        return await response.json();
    };
    
    const openCalculator = () => {
        const left = 1000, top = 5, width = 500, height = 400;
        const windowFeatures = `width=${width},height=${height},left=${left},top=${top},toolbar=no,scrollbars=no,resizable=yes`;
        window.open('https://www.tcsion.com/OnlineAssessment/ScientificCalculator/Calculator.html', 'ScientificCalculator', windowFeatures);
    };

    const loadQuiz = async () => {
        loaderOverlay.classList.remove('hidden'); // Show loader
        try {
            quizData = await loadJSON('quiz_data.json');
            quizAnswers = await loadJSON('quiz_answers.json');
            createNavButtons();
            showQuestion(0);
            startTimer();
        } catch (error) {
            console.error('Error loading quiz data:', error);
            if (quizDiv) quizDiv.innerHTML = '<p class="result-incorrect">Failed to load quiz data.</p>';
        } finally {
            loaderOverlay.classList.add('hidden'); // Hide loader
        }
    };

    const startTimer = () => {
        clearInterval(timerInterval);
        timeRemaining = timeLimitMinutes * 60;
        timerInterval = setInterval(() => {
            if (timeRemaining <= 0) {
                clearInterval(timerInterval);
                alert("Time's up! The quiz will now be submitted.");
                showResults();
            } else {
                timeRemaining--;
                const minutes = Math.floor(timeRemaining / 60);
                const seconds = timeRemaining % 60;
                if(timerDisplay) timerDisplay.textContent = `Time Left: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }
        }, 1000);
    };

    const renderQuiz = () => {
        if (!quizData || quizData.length === 0) return;
        const q = quizData[currentQuestionIndex];
        quizDiv.innerHTML = '';
        optionsDiv.innerHTML = '';
        if (questionNumberDiv) questionNumberDiv.textContent = `Q.${currentQuestionIndex + 1}`;
        if (questionMetaDiv) questionMetaDiv.textContent = q.appeared_in_year ? `Appeared in: ${q.appeared_in_year}` : '';

        if (q.image_url) {
            const imgContainer = document.createElement('div');
            imgContainer.className = 'question-image-container';
            const img = document.createElement('img');
            img.src = q.image_url;
            img.alt = `Image for question ${currentQuestionIndex + 1}`;
            img.className = 'question-image';
            img.onerror = function() {
                this.style.display = 'none';
                const fallbackLink = document.createElement('a');
                fallbackLink.href = this.src;
                fallbackLink.textContent = `Image failed to load. Click here to view.`;
                fallbackLink.target = '_blank';
                fallbackLink.className = 'image-fallback-link';
                imgContainer.appendChild(fallbackLink);
            };
            imgContainer.appendChild(img);
            if (q.image_caption) {
                const caption = document.createElement('figcaption');
                caption.className = 'question-caption';
                caption.textContent = q.image_caption;
                imgContainer.appendChild(caption);
            }
            quizDiv.appendChild(imgContainer);
        }
        
        const introText = q.question.split('\n')[0];
        const introPara = document.createElement('p');
        introPara.textContent = introText;
        quizDiv.appendChild(introPara);

        if (q.type === 'Match the Following') {
            const table = buildMatchTable(q.question);
            if (table) quizDiv.appendChild(table);
        } else {
            const restOfQuestion = q.question.substring(introText.length).trim();
            if (restOfQuestion) {
                 const questionText = document.createElement('p');
                 questionText.textContent = restOfQuestion;
                 quizDiv.appendChild(questionText);
            }
        }
        
        const answerData = quizAnswers[q.id];
        const isMsq = answerData && Array.isArray(answerData.answer);
        
        if (q.type === 'Numeric Answer') {
            const numericInput = document.createElement('input');
            numericInput.type = 'number';
            numericInput.className = 'numeric-input';
            numericInput.id = q.id;
            numericInput.addEventListener('input', () => { answeredQuestions.add(currentQuestionIndex); updateNavButtons(); });
            optionsDiv.appendChild(numericInput);
        } else if (q.options && q.options.length > 0) {
            const optionsList = document.createElement('ul');
            optionsList.classList.add('options-list');
            const inputType = isMsq ? 'checkbox' : 'radio';

            q.options.forEach(opt => {
                const optionItem = document.createElement('li');
                optionItem.classList.add('option-item');
                const inputElement = document.createElement('input');
                inputElement.type = inputType;
                inputElement.name = q.id;
                inputElement.value = opt.label;
                inputElement.id = `${q.id}-${opt.label}`;
                const optionLabel = document.createElement('label');
                optionLabel.htmlFor = `${q.id}-${opt.label}`;
                optionLabel.textContent = opt.text;
                optionItem.appendChild(inputElement);
                optionItem.appendChild(optionLabel);
                optionsList.appendChild(optionItem);
                optionItem.addEventListener('click', (e) => {
                    if (e.target.tagName !== 'INPUT' && inputType === 'checkbox') {
                        inputElement.checked = !inputElement.checked;
                    } else if (e.target.tagName !== 'INPUT' && inputType === 'radio') {
                        inputElement.checked = true;
                    }
                    answeredQuestions.add(currentQuestionIndex);
                    updateNavButtons();
                });
            });
            optionsDiv.appendChild(optionsList);
        }

        const savedAnswer = localStorage.getItem(q.id);
        if (savedAnswer) {
            if (isMsq) {
                const savedAnswers = JSON.parse(savedAnswer);
                savedAnswers.forEach(ans => {
                    const checkbox = document.querySelector(`#${q.id}-${ans}`);
                    if (checkbox) checkbox.checked = true;
                });
            } else if (q.type === 'Numeric Answer') {
                const input = document.getElementById(q.id);
                if (input) input.value = savedAnswer;
            } else {
                const selectedRadio = document.querySelector(`input[name="${q.id}"][value="${savedAnswer}"]`);
                if (selectedRadio) selectedRadio.checked = true;
            }
        }
    };

    const createNavButtons = () => {
        if (!quizNavPalette) return;
        quizNavPalette.innerHTML = '';
        quizData.forEach((_, index) => {
            const button = document.createElement('button');
            button.classList.add('nav-button-palette');
            button.textContent = index + 1;
            button.addEventListener('click', () => { saveAnswer(); showQuestion(index); });
            quizNavPalette.appendChild(button);
        });
    };
    
    const showQuestion = (index) => {
        if (index < 0 || index >= quizData.length) return;
        currentQuestionIndex = index;
        visitedQuestions.add(index);
        solutionDisplayContainer.classList.add('hidden');
        solutionDisplayContainer.innerHTML = '';
        renderQuiz();
        if (prevBtn) prevBtn.disabled = index === 0;
        if (nextBtn) nextBtn.disabled = index === quizData.length - 1;
        updateNavButtons();
    };
    
    const nextQuestion = () => { if (currentQuestionIndex < quizData.length - 1) { saveAnswer(); showQuestion(currentQuestionIndex + 1); } };
    const prevQuestion = () => { if (currentQuestionIndex > 0) { saveAnswer(); showQuestion(currentQuestionIndex - 1); } };

    const clearResponse = () => {
        const q = quizData[currentQuestionIndex];
        if (q.type === 'Numeric Answer') {
            const input = document.getElementById(q.id);
            if (input) input.value = '';
        } else {
            const checkedItems = document.querySelectorAll(`input[name="${q.id}"]:checked`);
            checkedItems.forEach(item => item.checked = false);
        }
        answeredQuestions.delete(currentQuestionIndex);
        localStorage.removeItem(q.id);
        updateNavButtons();
    };

    const saveAnswer = () => {
        const q = quizData[currentQuestionIndex];
        const answerData = quizAnswers[q.id];
        const isMsq = answerData && Array.isArray(answerData.answer);

        if (isMsq) {
            const checkedItems = document.querySelectorAll(`input[name="${q.id}"]:checked`);
            if (checkedItems.length > 0) {
                const selectedValues = Array.from(checkedItems).map(item => item.value);
                localStorage.setItem(q.id, JSON.stringify(selectedValues));
                answeredQuestions.add(currentQuestionIndex);
            } else {
                localStorage.removeItem(q.id);
                answeredQuestions.delete(currentQuestionIndex);
            }
            return;
        }

        let selectedValue = null;
        if (q.type === 'Numeric Answer') {
            const input = document.getElementById(q.id);
            if (input && input.value !== '') selectedValue = input.value;
        } else {
            const selectedOption = document.querySelector(`input[name="${q.id}"]:checked`);
            if (selectedOption) selectedValue = selectedOption.value;
        }

        if (selectedValue !== null) {
            localStorage.setItem(q.id, selectedValue);
            answeredQuestions.add(currentQuestionIndex);
        } else {
            localStorage.removeItem(q.id);
            answeredQuestions.delete(currentQuestionIndex);
        }
    };
    
    const updateNavButtons = () => {
        document.querySelectorAll('.nav-button-palette').forEach((button, index) => {
            button.classList.remove('active', 'visited', 'answered');
            if (index === currentQuestionIndex) button.classList.add('active');
            if (answeredQuestions.has(index)) button.classList.add('answered');
            else if (visitedQuestions.has(index)) button.classList.add('visited');
        });
    };

    const showResults = () => {
        clearInterval(timerInterval);
        saveAnswer();
        let totalScore = 0;
        
        const resultsData = quizData.map(q => {
            const answeredValue = localStorage.getItem(q.id);
            const answerData = quizAnswers[q.id];
            
            let points = 0;
            let status = 'Not Answered';
            let userClass = 'result-incorrect';
            let correctAnswerText = 'N/A';
            let explanation = 'No explanation available.';
            const isMsq = answerData && Array.isArray(answerData.answer);

            if (answerData) {
                explanation = answerData.explanation;

                if (isMsq) {
                    correctAnswerText = answerData.answer.join(', ').toUpperCase();
                    points = 0; // Default score is 0 for MSQs

                    if (answeredValue) {
                        const userAnswers = JSON.parse(answeredValue);
                        const correctAnswers = answerData.answer;

                        const userAnswersSortedStr = JSON.stringify(userAnswers.sort());
                        const correctAnswersSortedStr = JSON.stringify(correctAnswers.sort());

                        if (userAnswersSortedStr === correctAnswersSortedStr) {
                            points = 2;
                            status = 'Correct!';
                            userClass = 'result-correct';
                        } else {
                            points = 0;
                            status = 'Incorrect.';
                        }
                    }
                } else if (q.type === 'Numeric Answer') {
                    const correctAnswerNum = parseFloat(answerData.answer);
                    let tolerance = Math.abs(correctAnswerNum) < 1.0 ? 0.1 : 1.0;
                    const min = correctAnswerNum - tolerance;
                    const max = correctAnswerNum + tolerance;
                    correctAnswerText = `${correctAnswerNum} (Acceptable: ${min.toFixed(3)} to ${max.toFixed(3)})`;
                    if (answeredValue) {
                        const userNum = parseFloat(answeredValue);
                        if (!isNaN(userNum) && userNum >= min && userNum <= max) {
                            points = 1; status = 'Correct!'; userClass = 'result-correct';
                        } else {
                            points = 0; status = 'Incorrect.';
                        }
                    }
                } else { // MCQ
                    correctAnswerText = answerData.answer;
                    if (answeredValue) {
                        if (String(answeredValue).toLowerCase() === String(correctAnswerText).toLowerCase()) {
                            points = 1; status = 'Correct!'; userClass = 'result-correct';
                        } else {
                            points = -1/3; status = 'Incorrect.';
                        }
                    }
                }
            } else { 
                if (answeredValue) {
                    points = -1/3; status = 'Incorrect';
                }
            }
            totalScore += points;

            return { question: q.question, type: q.type, isMsq: isMsq, userAnswer: answeredValue, correctAnswer: correctAnswerText, explanation, status, userClass };
        });

        if (totalScore < 0) totalScore = 0;
        if (quizContent) quizContent.classList.add('hidden');
        if (resultsContent) resultsContent.classList.remove('hidden');
        if (finalScore) finalScore.textContent = `Final Score: ${totalScore.toFixed(2)} out of ${quizData.length}`;
        if (resultsDiv) resultsDiv.innerHTML = '';

        resultsData.forEach(item => {
            const resultItem = document.createElement('div');
            resultItem.classList.add('results-item');
            const qContainer = document.createElement('div');
            qContainer.classList.add('question-text');
            const introText = item.question.split('\n')[0];
            const introPara = document.createElement('p');
            introPara.textContent = introText;
            qContainer.appendChild(introPara);
            if (item.type === 'Match the Following') {
                const table = buildMatchTable(item.question);
                if (table) qContainer.appendChild(table);
            } else {
                const restOfQuestion = item.question.substring(introText.length).trim();
                if(restOfQuestion) { const restPara = document.createElement('p'); restPara.textContent = restOfQuestion; qContainer.appendChild(restPara); }
            }
            resultItem.appendChild(qContainer);
            
            let userAnswerDisplay = 'Not answered';
            if(item.userAnswer) {
                if (item.isMsq) {
                    userAnswerDisplay = JSON.parse(item.userAnswer).join(', ').toUpperCase();
                } else {
                    userAnswerDisplay = String(item.userAnswer).toUpperCase();
                }
            }
            const userAnswerText = document.createElement('p');
            userAnswerText.innerHTML = `<strong>Your Answer:</strong> <span class="${item.userClass}">${userAnswerDisplay}</span> (${item.status})`;
            resultItem.appendChild(userAnswerText);
            const correctAnswerTextElement = document.createElement('p');
            correctAnswerTextElement.innerHTML = `<strong>Correct Answer:</strong> <span class="result-correct">${String(item.correctAnswer).toUpperCase()}</span>`;
            resultItem.appendChild(correctAnswerTextElement);
            const explanationText = document.createElement('p');
            explanationText.innerHTML = `<strong>Explanation:</strong> ${item.explanation}`;
            resultItem.appendChild(explanationText);
            if (resultsDiv) resultsDiv.appendChild(resultItem);
        });
        localStorage.clear();
    };
    
    const retakeQuiz = () => {
        currentQuestionIndex = 0;
        visitedQuestions.clear();
        answeredQuestions.clear();
        localStorage.clear();
        if (quizContent) quizContent.classList.remove('hidden');
        if (resultsContent) resultsContent.classList.add('hidden');
        loadQuiz();
    };

    const fetchSolution = async () => {
        const questionId = quizData[currentQuestionIndex].id;
        const solutionsCache = JSON.parse(localStorage.getItem('solutionsCache')) || {};
        const cachedSolution = solutionsCache[questionId];
        solutionDisplayContainer.classList.remove('hidden');

        if (cachedSolution) {
            solutionDisplayContainer.innerHTML = cachedSolution;
            return;
        }

        const q = quizData[currentQuestionIndex];
        let prewrittenHtml = '';
        const prewrittenAnswer = quizAnswers[questionId];

        if (prewrittenAnswer && prewrittenAnswer.explanation) {
            let correctAnswerDisplay = prewrittenAnswer.answer;
            if (q.type === 'Numeric Answer') {
                const correctAnswerNum = parseFloat(prewrittenAnswer.answer);
                let tolerance = Math.abs(correctAnswerNum) < 1.0 ? 0.1 : 1.0;
                const min = correctAnswerNum - tolerance;
                const max = correctAnswerNum + tolerance;
                correctAnswerDisplay = `${correctAnswerNum} (Acceptable: ${min.toFixed(3)} to ${max.toFixed(3)})`;
            }

            prewrittenHtml = `
                <div>
                    <h3>Solution from Guide</h3>
                    <p><strong>Correct Answer:</strong> ${String(correctAnswerDisplay).toUpperCase()}</p>
                    <p>${prewrittenAnswer.explanation}</p>
                </div>
            `;
        }

        let loadingMessage = '<hr><p><em>Fetching additional details from AI...</em></p>';
        if (!prewrittenHtml) {
            loadingMessage = '<p>Fetching solution from AI, please wait...</p>';
        }
        solutionDisplayContainer.innerHTML = prewrittenHtml + loadingMessage;
        
        async function imageToObject(url) {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch image: ${url}`);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve({
                        mimeType: blob.type,
                        data: reader.result.split(",")[1]
                    });
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }

        try {
            let imagePayload = null;
            if (q.image_url) {
                try {
                    imagePayload = await imageToObject(q.image_url);
                } catch (err) {
                    console.error("Image conversion failed:", err);
                }
            }

            const response = await fetch("https://backend-server-pk7h.onrender.com/api/solution", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: `Provide a detailed, step-by-step solution...\n\nQuestion:\n${q.question}\n\nOptions:\n${q.options ? q.options.map(opt => `(${opt.label}) ${opt.text}`).join('\n') : 'This is a numeric answer question.'}`,
                    image: imagePayload
                })
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Backend request failed: ${errorBody}`);
            }
            
            const data = await response.json();
            const solutionText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No AI response.";

            const aiSolutionHtml = `
                <div>
                    <hr>
                    <h3>AI-Generated Solution</h3>
                    ${solutionText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}
                </div>
            `;

            const fullSolutionHtml = prewrittenHtml + aiSolutionHtml;
            solutionDisplayContainer.innerHTML = fullSolutionHtml;

            solutionsCache[questionId] = fullSolutionHtml;
            localStorage.setItem('solutionsCache', JSON.stringify(solutionsCache));

        } catch (error) {
            console.error("Error fetching solution:", error);
            solutionDisplayContainer.innerHTML =
                prewrittenHtml + '<p class="result-incorrect">Sorry, the additional AI details could not be fetched.</p>';
        }
    };
    
    const downloadSolutions = () => {
        // ... (This function is unchanged from the previous version)
    };

    // --- Event Listeners ---
    if (prevBtn) prevBtn.addEventListener('click', prevQuestion);
    if (nextBtn) nextBtn.addEventListener('click', nextQuestion);
    if (clearBtn) clearBtn.addEventListener('click', clearResponse);
    if (submitBtn) submitBtn.addEventListener('click', showResults);
    if (retakeBtn) retakeBtn.addEventListener('click', retakeQuiz);
    if (calcBtn) calcBtn.addEventListener('click', openCalculator);
    if (viewSolutionBtn) viewSolutionBtn.addEventListener('click', fetchSolution);
    if (downloadSolutionsBtn) downloadSolutionsBtn.addEventListener('click', downloadSolutions);

    // --- Initial Load ---
    loadQuiz();
});

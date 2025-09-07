// File: main.js
document.addEventListener('DOMContentLoaded', async () => {
    const quizContainer = document.getElementById('quiz-list-container');
    const loader = document.getElementById('loader'); // Get the loader element
    if (!quizContainer || !loader) return;

    // Asynchronously fetch the quiz data from our JSON file
    async function loadQuizzes() {
        try {
            const response = await fetch('quizzes.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const quizzes = await response.json();
            renderQuizzes(quizzes);
        } catch (error) {
            console.error("Could not load quizzes:", error);
            quizContainer.innerHTML = `<p class="error-message">Error: Could not load the quiz list. Please run the Python script to generate it.</p>`;
        } finally {
            // This block runs whether the try succeeds or fails
            loader.style.opacity = '0'; // Fade out the loader
            // Wait for the transition to finish before setting display to none
            setTimeout(() => {
                loader.style.display = 'none';
            }, 300);
        }
    }

    // Function to generate quiz cards and add them to the page
    const renderQuizzes = (quizzes = []) => {
        if (quizzes.length === 0) {
             quizContainer.innerHTML = `<p>No quizzes found. Add a quiz folder and run the 'generate_quiz_list.py' script.</p>`;
             return;
        }

        quizContainer.innerHTML = ''; // Clear existing content

        quizzes.forEach(quiz => {
            const cardLink = document.createElement('a');
            cardLink.href = `${quiz.path}index.html`;
            cardLink.className = 'quiz-card';

            const cardContent = document.createElement('div');
            cardContent.className = 'card-content';

            const title = document.createElement('h2');
            title.textContent = quiz.title;

            const description = document.createElement('p');
            description.textContent = quiz.description;

            cardContent.appendChild(title);
            cardContent.appendChild(description);

            const cardFooter = document.createElement('div');
            cardFooter.className = 'card-footer';
            cardFooter.textContent = 'Start Quiz';

            cardLink.appendChild(cardContent);
            cardLink.appendChild(cardFooter);

            quizContainer.appendChild(cardLink);
        });
    };

    // Initial load
    loadQuizzes();
});

import React from 'react';
import '../styles/ExamBrief.css';

function ExamBrief() {
  return (
    <div className="page exam-brief-page">
      <div className="page-header">
        <div>
          <h1>Бриф перед экзаменом</h1>
        </div>
      </div>

      <section className="exam-brief-panel">
        <p className="text-muted">
          Страница с памяткой для волонтёров на экзамене. Бриф перед экзаменом начинается в 11:10.
        </p>
        <div className="exam-brief-frame-wrap">
          <iframe
            className="exam-brief-frame"
            src="/exam-brief.html"
            title="Бриф перед экзаменом"
          />
        </div>
      </section>
    </div>
  );
}

export default ExamBrief;

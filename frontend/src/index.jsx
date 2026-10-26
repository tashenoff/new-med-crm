import "./theme/curai-loading.css";
import { AppLoading } from './components/common/LoadingIndicator';
import "./components/patients/patientTerms.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import "./theme/curai.variables.css";
import "./theme/curai.css";
import "./theme/curai-foundations.css";
import "./theme/curai-search.css";
import "./theme/curai-doctors.css";
import "./theme/curai-patients.css";
import "./theme/curai-clinical.css";
import "./theme/curai-directories.css";
import "./theme/curai-consultation-picker.css";
const App = React.lazy(() => import("./App"));
const PatientTermsPage = React.lazy(() => import("./pages/PatientTermsPage"));
const isPublicTerms = /^\/consent(?:\/|$)/.test(window.location.pathname);

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <React.Suspense fallback={<AppLoading />}>
        {isPublicTerms ? <PatientTermsPage /> : <App />}
      </React.Suspense>
    </BrowserRouter>
  </React.StrictMode>,
);

import "./theme/curai-payment-r21.css";

import "./theme/curai-treatment-plans.css";
import "./theme/curai-communication.css";

import "./theme/curai-glass-headers.css";

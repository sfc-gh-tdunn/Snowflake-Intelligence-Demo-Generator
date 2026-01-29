import React, { useState } from 'react';
import { fetchBrandData } from '../services/brandfetch';
import { generateCustomDemoData } from '../services/sqlStatement';
import { MAIN_VERTICAL_OPTIONS, SUB_VERTICAL_OPTIONS } from '../config/endpoints';

function FormPage({ onSubmit, initialData }) {
  const [formData, setFormData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState('');
  const [fetchBrandAssets, setFetchBrandAssets] = useState(true);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
      // Reset sub-vertical when main vertical changes
      ...(name === 'mainVertical' ? { subVertical: '' } : {}),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.name || !formData.companyUrl || !formData.mainVertical) {
      setError('Please fill in all required fields.');
      return;
    }

    // Check if sub-vertical is required
    if (SUB_VERTICAL_OPTIONS[formData.mainVertical] && !formData.subVertical) {
      setError('Please select a sub-vertical.');
      return;
    }

    setLoading(true);

    try {
      // Fetch brand data (skip if checkbox unchecked)
      let brandData = null;
      if (fetchBrandAssets) {
        setLoadingMessage('Fetching brand data...');
        brandData = await fetchBrandData(formData.companyUrl);
      } else {
        // Use empty/default brand data when skipping
        brandData = {
          logos: [],
          colors: [],
          name: formData.companyUrl,
        };
      }

      // If Custom vertical, generate custom demo data (this includes the Raven call for table schemas)
      let customDataResult = null;
      let questions = [];
      
      if (formData.mainVertical === 'Custom') {
        setLoadingMessage('Generating custom demo data (this may take a few minutes)...');
        customDataResult = await generateCustomDemoData(
          {
            companyUrl: formData.companyUrl,
            useCases: formData.useCases,
            recordsPerTable: formData.recordsPerTable,
          },
          (status) => setLoadingMessage(status)
        );
        
        // Use sample questions from the agent as discovery questions
        questions = customDataResult.sampleQuestions || [];
        
        // Show success message briefly
        setLoadingMessage(`✓ ${customDataResult.message}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      onSubmit(formData, brandData, questions, customDataResult);
    } catch (err) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const showSubVertical = SUB_VERTICAL_OPTIONS[formData.mainVertical];

  return (
    <div className="page form-page">
      <div className="form-container">
        <h1 className="form-title">Snowflake Intelligence Demo Generator</h1>
        <p className="form-subtitle">Configure your personalized demo experience</p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="mainVertical">Company Vertical *</label>
            <select
              id="mainVertical"
              name="mainVertical"
              value={formData.mainVertical}
              onChange={handleChange}
              disabled={loading}
            >
              <option value="">Select a vertical...</option>
              {MAIN_VERTICAL_OPTIONS.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          {showSubVertical && (
            <div className="form-group">
              <label htmlFor="subVertical">Sub Vertical *</label>
              <select
                id="subVertical"
                name="subVertical"
                value={formData.subVertical}
                onChange={handleChange}
                disabled={loading}
              >
                <option value="">Select a sub-vertical...</option>
                {SUB_VERTICAL_OPTIONS[formData.mainVertical].map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="name">Rep Name *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              maxLength={100}
              placeholder="Enter your name"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="companyUrl">
              Company URL *
              {/* <span className="tooltip-wrapper">
                <span className="tooltip-icon">?</span>
                <span className="tooltip-text">URL Example: www.snowflake.com</span>
              </span> */}
            </label>
            <input
              type="text"
              id="companyUrl"
              name="companyUrl"
              value={formData.companyUrl}
              onChange={handleChange}
              maxLength={200}
              placeholder="Example www.snowflake.com"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="teamMembers">Team Members/Audience (optional)</label>
            <input
              type="text"
              id="teamMembers"
              name="teamMembers"
              value={formData.teamMembers}
              onChange={handleChange}
              maxLength={200}
              placeholder="Who will use the agent?"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="useCases">Specific Use Cases (optional)</label>
            <textarea
              id="useCases"
              name="useCases"
              value={formData.useCases}
              onChange={handleChange}
              placeholder="Describe specific use cases..."
              rows={3}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="recordsPerTable">Records per Table (optional)</label>
            <input
              type="number"
              id="recordsPerTable"
              name="recordsPerTable"
              value={formData.recordsPerTable}
              onChange={handleChange}
              min={1}
              disabled={loading}
            />
          </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={fetchBrandAssets}
                onChange={(e) => setFetchBrandAssets(e.target.checked)}
                disabled={loading}
              />
              <span className="checkbox-text">Fetch brand assets (logos & colors)</span>
              <span className="checkbox-hint">Uncheck to skip BrandFetch API call during testing</span>
            </label>
          </div>

          <button type="submit" className="submit-button" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner"></span>
                {loadingMessage || 'Processing...'}
              </>
            ) : (
              'Submit'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default FormPage;


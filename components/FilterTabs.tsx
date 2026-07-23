import React from 'react';
import { CATEGORIES } from '../constants';

interface FilterTabsProps {
  activeCategory: string;
  setActiveCategory: (category: string) => void;
  activeStatus: string[];
  setActiveStatus: (status: string[]) => void;
  onCreateMarket?: () => void;
}

const STATUS_FILTERS = ['Open', 'Resolved'];

const FilterTabs: React.FC<FilterTabsProps> = ({ 
  activeCategory, 
  setActiveCategory, 
  activeStatus, 
  setActiveStatus,
  onCreateMarket 
}) => {
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = React.useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = React.useState(false);

  const handleStatusToggle = (status: string) => {
    // Toggle style: exactly one selected at a time
    if (activeStatus.length === 1 && activeStatus[0] === status) {
      // keep it selected; at least one must remain active
      setActiveStatus([status]);
      return;
    }
    setActiveStatus([status]);
  };

  return (
    <div className="w-full bg-background-card border-b border-border-default">
      <div className="w-full px-3 md:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center py-2 md:py-4 gap-2 md:gap-4">
          
          {/* MOBILE: Category Dropdown */}
          <div className="md:hidden w-full relative">
            <button
              onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
              className="w-full px-4 py-2.5 bg-background-hover border border-border-default rounded-lg flex items-center justify-between text-sm font-medium text-text-primary"
            >
              <span>{activeCategory}</span>
              <svg className={`w-4 h-4 transition-transform ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {isCategoryDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40 bg-black/50" 
                  onClick={() => setIsCategoryDropdownOpen(false)}
                />
                <div className="absolute top-full left-0 right-0 mt-1 bg-background-card border border-border-default rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                  {CATEGORIES.map(category => (
                    <button
                      key={category}
                      onClick={() => {
                        setActiveCategory(category);
                        setIsCategoryDropdownOpen(false);
                      }}
                      className={`w-full px-4 py-3 text-left text-sm font-medium transition-colors ${
                        activeCategory === category
                          ? 'bg-inverse !text-inverse-ink'
                          : 'text-text-secondary hover:bg-background-hover'
                      }`}
                    >
                      {activeCategory === category && (
                        <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {category}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* DESKTOP: Category Filters - Horizontal scroll */}
          <div className="hidden md:flex items-center gap-2 overflow-x-auto pb-0 scrollbar-hide">
            {CATEGORIES.map(category => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap flex-shrink-0 ${
                  activeCategory === category
                    ? 'bg-inverse !text-inverse-ink'
                    : 'text-text-secondary hover:text-white hover:bg-background-hover'
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          {/* Status Filters */}
          <div className="flex items-center gap-2 md:gap-4 w-full md:w-auto">
            {/* MOBILE: Status Dropdown */}
            <div className="md:hidden flex-1 relative">
              <button
                onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                className="w-full px-4 py-2.5 bg-background-hover border border-border-default rounded-lg flex items-center justify-between text-sm font-medium text-text-primary"
              >
                <span>{activeStatus.join(', ')}</span>
                <svg className={`w-4 h-4 transition-transform ${isStatusDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {isStatusDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40 bg-black/50" 
                    onClick={() => setIsStatusDropdownOpen(false)}
                  />
                  <div className="absolute top-full left-0 right-0 mt-1 bg-background-card border border-border-default rounded-lg shadow-lg z-50">
                    {STATUS_FILTERS.map(status => (
                      <button
                        key={status}
                        onClick={() => {
                          handleStatusToggle(status);
                        }}
                        className={`w-full px-4 py-3 text-left text-sm font-medium transition-colors ${
                          activeStatus.includes(status)
                            ? 'bg-inverse !text-inverse-ink'
                            : 'text-text-secondary hover:bg-background-hover'
                        }`}
                      >
                        {activeStatus.includes(status) && (
                          <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {status}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* DESKTOP: Status Filters */}
            <div className="hidden md:flex items-center gap-2">
              {STATUS_FILTERS.map(status => (
                <button
                  key={status}
                  onClick={() => handleStatusToggle(status)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all whitespace-nowrap ${
                    activeStatus.includes(status)
                      ? 'bg-inverse !text-inverse-ink'
                      : 'text-text-secondary hover:text-white hover:bg-background-hover'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            
            {/* Create Market Button - Desktop only */}
            {onCreateMarket && (
              <button
                onClick={onCreateMarket}
                className="hidden md:flex px-4 py-2 bg-inverse hover:bg-inverse-hover text-inverse-ink text-sm font-semibold rounded-lg transition-colors"
              >
                Create Market
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilterTabs;

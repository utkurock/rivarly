import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useFirebase } from '../contexts/FirebaseContext';
import AccountMenu from './AccountMenu';
import ThemeToggle from './ThemeToggle';

// Get user profile from Firebase context
export const useUserProfile = () => {
    const { userProfile } = useFirebase();
    return userProfile;
};

const NavLink: React.FC<{ to: string; icon: React.ReactNode; children: React.ReactNode; onClick?: (e: React.MouseEvent) => void }> = ({ to, icon, children, onClick }) => {
    const location = useLocation();
    const isActive = location.pathname === to;

    return (
        <Link
            to={to}
            onClick={onClick}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                isActive
                    ? 'bg-background-hover font-medium text-text-primary'
                    : 'text-text-secondary hover:bg-background-card hover:text-text-primary'
            }`}
        >
            <span className="flex-shrink-0">
                {icon}
            </span>
            <span className="text-sm">{children}</span>
        </Link>
    );
};

interface SidebarProps {
    onCreateMarket: () => void;
    isMobileMenuOpen: boolean;
    setIsMobileMenuOpen: (open: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onCreateMarket, isMobileMenuOpen, setIsMobileMenuOpen }) => {
    // Close mobile menu on route change
    const location = useLocation();
    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    return (
        <>
        {/* Mobile Overlay */}
        {isMobileMenuOpen && (
            <div
                className="md:hidden fixed inset-0 bg-black/60 z-40"
                onClick={() => setIsMobileMenuOpen(false)}
            />
        )}

        {/* Sidebar */}
        <aside className={`
            fixed md:sticky top-0 h-full md:h-full w-64 bg-background-body border-r border-border-default flex-shrink-0 flex flex-col z-50
            md:translate-x-0 transition-transform duration-300 ease-in-out
            ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
            <Link to="/" className="px-4 pt-4 pb-5 flex-shrink-0 border-b border-border-default hover:bg-background-card transition-colors cursor-pointer">
                <div className="w-full flex items-center justify-center gap-2">
                    <svg className="w-6 h-6 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 16.9 5.7 21.4 8 14 2 9.4h7.6z" />
                    </svg>
                    <span className="text-2xl font-extrabold tracking-tight text-text-primary">Starcast</span>
                </div>
            </Link>

            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto"  style={{ scrollbarWidth: 'thin' }}>
                {/* 1. Markets (home) */}
                <NavLink
                    to="/"
                    icon={
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                            <path d="M14.828 14.828 21 21"/>
                            <path d="M21 16v5h-5"/>
                            <path d="m21 3-9 9-4-4-6 6"/>
                            <path d="M21 8V3h-5"/>
                        </svg>
                    }>
                    Markets
                </NavLink>

                {/* 2. Social */}
                <NavLink
                    to="/social"
                    icon={
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                            <path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>
                        </svg>
                    }>
                    Social
                </NavLink>

                {/* 3. Hot News */}
                <NavLink
                    to="/news"
                    icon={
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                            <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
                            <path d="M18 14h-8"/>
                            <path d="M15 18h-5"/>
                            <path d="M10 6h8v4h-8V6Z"/>
                        </svg>
                    }>
                    Hot News
                </NavLink>

                {/* 4. Ecosystem */}
                <NavLink
                    to="/ecosystem"
                    icon={
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                            <circle cx="18" cy="5" r="3"/>
                            <circle cx="6" cy="12" r="3"/>
                            <circle cx="18" cy="19" r="3"/>
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                        </svg>
                    }>
                    Ecosystem
                </NavLink>

                {/* 5. Tasks */}
                <NavLink
                    to="/tasks"
                    icon={
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                            <path d="M11 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6"/>
                            <path d="m9 11 3 3L22 4"/>
                        </svg>
                    }>
                    Tasks
                </NavLink>

                {/* 6. Leaderboard */}
                <NavLink
                    to="/leaderboard"
                    icon={
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
                            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
                            <path d="M4 22h16"/>
                            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
                            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
                            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
                        </svg>
                    }>
                    Leaderboard
                </NavLink>

                {/* 7. Profile */}
                <NavLink
                    to="/profile"
                    icon={
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                            <circle cx="12" cy="8" r="5"/>
                            <path d="M20 21a8 8 0 0 0-16 0"/>
                        </svg>
                    }>
                    Profile
                </NavLink>
            </nav>

            <div className="flex-shrink-0 px-3 pb-2 pt-3">
                 {/* Light / dark theme switch */}
                 <ThemeToggle variant="full" />
            </div>

            <div className="flex-shrink-0 p-4 border-t border-border-default">
                 {/* Combined wallet + profile account menu */}
                 <AccountMenu onNavigate={() => setIsMobileMenuOpen(false)} />
            </div>
        </aside>
        </>
    );
};

export default Sidebar;

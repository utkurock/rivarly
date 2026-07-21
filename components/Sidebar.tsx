import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useFirebase } from '../contexts/FirebaseContext';

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
                    ? 'bg-gray-100 font-medium text-[#111111]'
                    : 'text-[#999999] hover:bg-gray-50 hover:text-[#111111]'
            }`}
        >
            <span className={`flex-shrink-0 ${isActive ? '[&_img]:brightness-0' : ''}`}>
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
    const { userProfile } = useFirebase();

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
                className="md:hidden fixed inset-0 bg-black/50 z-40"
                onClick={() => setIsMobileMenuOpen(false)}
            />
        )}

        {/* Sidebar */}
        <aside className={`
            fixed md:sticky top-0 h-full md:h-full w-64 bg-white border-r border-gray-200 flex-shrink-0 flex flex-col z-50
            md:translate-x-0 transition-transform duration-300 ease-in-out
            ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
            <Link to="/social" className="px-4 pt-4 pb-5 flex-shrink-0 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer">
                <div className="w-full flex items-center justify-center">
                    <img
                        src="https://depmm6vsligdwkty.public.blob.vercel-storage.com/END.png"
                        alt="Home"
                        className="h-8 object-contain"
                        style={{ maxWidth: '70%' }}
                    />
                </div>
            </Link>

            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto"  style={{ scrollbarWidth: 'thin' }}>
                {/* 1. Social */}
                <NavLink
                    to="/social"
                    icon={
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                            <path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>
                        </svg>
                    }>
                    Social
                </NavLink>

                {/* 2. Markets */}
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

                {/* 4. Profile */}
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

            <div className="flex-shrink-0 p-4 border-t border-gray-100 space-y-3">
                 {/* Profile + Avatar */}
                 {userProfile && (
                     <Link
                         to="/profile"
                         onClick={() => setIsMobileMenuOpen(false)}
                         className="flex items-center gap-3 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                     >
                         <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                             {(() => {
                                 // Check if user has a custom avatar (base64 or URL, but not blob)
                                 const hasCustomAvatar = userProfile?.avatar &&
                                     userProfile.avatar.trim() !== '' &&
                                     !userProfile.avatar.startsWith('blob:');

                                 if (hasCustomAvatar) {
                                     return (
                                         <img
                                             src={userProfile.avatar}
                                             alt={userProfile.username}
                                             className="w-full h-full object-cover"
                                             onError={(e) => {
                                                 // Fallback to initial if image fails
                                                 e.currentTarget.style.display = 'none';
                                             }}
                                         />
                                     );
                                 }

                                 // Instagram-style placeholder
                                 return (
                                     <span className="text-sm font-bold text-gray-600">
                                         {userProfile.username?.[0]?.toUpperCase() || 'U'}
                                     </span>
                                 );
                             })()}
                         </div>
                         <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                                {userProfile.username || userProfile.displayName || 'Profile'}
                            </p>
                             <p className="text-xs text-gray-500 truncate">
                                 @{userProfile.username || 'user'}
                             </p>
                         </div>
                     </Link>
                 )}
            </div>
        </aside>
        </>
    );
};

export default Sidebar;

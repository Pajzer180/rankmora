import DashboardTopNav from '@/components/DashboardTopNav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen overflow-hidden bg-black text-gray-100 flex flex-col">
      <DashboardTopNav />
      <div className="flex flex-1 overflow-hidden min-h-0">
        {children}
      </div>
    </div>
  );
}

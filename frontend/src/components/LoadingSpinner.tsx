export function LoadingSpinner({ height = 'h-64' }: { height?: string }) {
  return (
    <div className={`flex items-center justify-center ${height}`}>
      <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export function ErrorMsg({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-32 text-red-400 text-sm">
      {message}
    </div>
  )
}

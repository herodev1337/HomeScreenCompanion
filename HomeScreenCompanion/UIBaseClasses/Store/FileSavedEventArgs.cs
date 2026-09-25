namespace HomeScreenCompanion.UIBaseClasses.Store
{
    public class FileSavedEventArgs
    {
        public FileSavedEventArgs(object options)
        {
            this.Options = options;
        }

        public object Options { get; }
    }
}

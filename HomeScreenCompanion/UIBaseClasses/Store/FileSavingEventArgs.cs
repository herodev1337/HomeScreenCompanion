namespace HomeScreenCompanion.UIBaseClasses.Store
{
    public class FileSavingEventArgs
    {
        public FileSavingEventArgs(object options)
        {
            this.Options = options;
        }

        public object Options { get; }

        public bool Cancel { get; set; }
    }
}

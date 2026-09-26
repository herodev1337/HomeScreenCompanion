using System.Collections;
using System.Collections.Generic;
using Emby.Web.GenericEdit;
using MediaBrowser.Model.GenericEdit;

namespace HomeScreenCompanion.UI.Tabs
{
    public sealed class DateIntervalCollection : List<DateIntervalUI>, IEditableObjectCollection
    {
        public DateIntervalCollection() { }

        public DateIntervalCollection(IEnumerable<DateIntervalUI> collection)
            : base(collection) { }

        public DateIntervalCollection(int capacity)
            : base(capacity) { }

        IEnumerator<IEditableObject> IEnumerable<IEditableObject>.GetEnumerator()
            => (IEnumerator<IEditableObject>)this.GetEnumerator();
    }
}

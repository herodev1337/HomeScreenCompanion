using System.Collections;
using System.Collections.Generic;
using Emby.Web.GenericEdit;
using MediaBrowser.Model.GenericEdit;

namespace HomeScreenCompanion.UI.Tabs
{
    public sealed class MediaInfoGroupCollection : List<MediaInfoGroupUI>, IEditableObjectCollection
    {
        public MediaInfoGroupCollection() { }

        public MediaInfoGroupCollection(IEnumerable<MediaInfoGroupUI> collection)
            : base(collection) { }

        public MediaInfoGroupCollection(int capacity)
            : base(capacity) { }

        IEnumerator<IEditableObject> IEnumerable<IEditableObject>.GetEnumerator()
            => (IEnumerator<IEditableObject>)this.GetEnumerator();
    }
}

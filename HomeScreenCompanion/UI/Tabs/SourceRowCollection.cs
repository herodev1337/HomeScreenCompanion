using System;
using System.Collections;
using System.Collections.Generic;
using Emby.Web.GenericEdit;
using MediaBrowser.Model.GenericEdit;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Editable collection of <see cref="SourceRowUI"/>. Follows the
    /// pattern from EmbyPluginUiDemo's <c>ChildCollectionItemCollection</c>.
    /// </summary>
    public sealed class SourceRowCollection : List<SourceRowUI>, IEditableObjectCollection
    {
        public SourceRowCollection() { }

        public SourceRowCollection(IEnumerable<SourceRowUI> collection)
            : base(collection) { }

        public SourceRowCollection(int capacity)
            : base(capacity) { }

        IEnumerator<IEditableObject> IEnumerable<IEditableObject>.GetEnumerator()
            => (IEnumerator<IEditableObject>)this.GetEnumerator();
    }
}

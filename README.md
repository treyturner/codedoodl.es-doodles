# codedoodl.es doodle source archive

This repo contains all doodle assets for [codedoodl.es](http://github.com/fluuuid/codedoodl.es).

Since the project is no longer live (:sad face:), if you would like to view the site you can now run it yourself:

* Step 1: run a webserver on the root of this repository
* Step 2: build / run the site application from [fluuuid/codedoodl.es](http://github.com/fluuuid/codedoodl.es) and change the [`config.buckets.SOURCE`](https://github.com/fluuuid/codedoodl.es/blob/bc6dfcbe45cafa5ea4295aa73467bcdc39864156/config/server.coffee#L15) variable to be the domain you're serving the doodles from.

**NOTE** the static assets in this repository have all been gzip encoded so you'll need the webserver you run in step 1 to serve all assets with the `"Content-Encoding=gzip"` header.

Substrate's `xp-substrate` host now has explicit block layout and positioning so
its canvas has a usable size without the original Shadow DOM styling behavior.
Particulate derives its route base from the script URL and accepts both directory
and `index.html` entrypoints, including the site's local `/__doodles/` mount.
Both repaired files retain gzip encoding under their original filenames.

Fury Ribbons (`samsy/fury-ribbons`, #073) has been removed from both master
catalogues. The original archive contained only an unresolved Git submodule
pointer for it, with no artwork files or repository URL. That pointer has also
been removed. Boobs (`samsy/boobs`, #074) is also unpublished by editorial choice;
its source remains archived but it is absent from both catalogues. The remaining
76 entries keep their original numbers and IDs; renumbering them would change
the site's existing shortlink destinations.

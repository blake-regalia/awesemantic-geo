#!/bin/bash
overpass_dir="$(pwd -P)/$1"
wget http://dev.overpass-api.de/releases/osm-3s_v0.7.53.tar.gz
tar -zxvf osm-3s_v*.tar.gz
rm osm-3s_v*.tar.gz
pushd osm-3s_v*
	./configure CXXFLAGS="-O3" --prefix=$overpass_dir
	if [ $# -eq 2 ]; then
		find . -type f -name '*.h' -exec sed -i '' s/open64/open/ {} +
		find . -type f -name '*.h' -exec sed -i '' s/lseek64/lseek/ {} +
		find . -type f -name '*.h' -exec sed -i '' s/ftruncate64/ftruncate/ {} +
	fi
	make install
popd

# remove installation directory
rm -rf osm-3s_v*

#!/bin/bash

# various package managers
osPM=(
	'/etc/redhat-release::yum'
	'/etc/arch-release::pacman'
	'/etc/gentoo-release::emerge'
	'/etc/SuSE-release::zypp'
	'/etc/debian_version::apt'
)

# dependency assertion
requires() {
	cmd=$1; install=$2
	type $cmd 2>/dev/null || {
		echo >&2 "ERROR: missing '$cmd'. it must be installed. you might be able to try:"
		if [ ! -z "$install" ]; then
			echo "    \$ $install"
		fi
		echo "Would you like me to try and run this command?"
		read -p "(y/n):" -n 1 -r
		echo
		if [[ $REPLY =~ ^[Yy]$ ]]; then
			eval $install
			hash $cmd 2>/dev/null  || {
				echo "Command still failed after trying to install, might require resourcing $PATH"
				exit 1
			}
			echo "Successfully installed"
			return 0
		fi

		exit 1
	}
}

# instructions depending on os type
case "$OSTYPE" in
	darwin*)
		requires node
		requires npm
		requires wget "brew install wget"
		requires "./bin/osmconvert" "mkdir ./bin && wget -O - http://m.m.i24.cc/osmconvert.c | cc -x c - -lz -O3 -o ./bin/osmconvert"
		requires "./bin/overpass/bin/update_database" "mkdir -p ./bin/overpass && brew install expat && ./install-overpass.sh ./bin/overpass osx"
		;;
	solaris* | linux* | bsd*)
		# determine os package manager
		pm=''
		for index in "${osPM[@]}"; do
			key="${index%%::*}"
			value="${index##*::}"
			if [[ -f "$key" ]]; then
				pm="$value"
			fi
		done
		echo "chose ${pm} as package manager"

		requires node
		requires npm
		requires wget "sudo ${pm} install wget"
		requires osmconvert "sudo ${pm} install osmctools"
		requires "./bin/overpass/bin/update_database" "mkdir -p ./bin/overpass && sudo ${pm} install g++ make expat libexpat1-dev zlib1g-dev && ./install-overpass.sh ./bin/overpass"
		;;
	*)
		echo "not sure how to support install process for '$OSTYPE' operating system" ;;
esac


echo "all dependencies met"

# install node dependencies
npm i

# load database
gulp database

echo "all done :)"